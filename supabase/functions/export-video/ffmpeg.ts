/**
 * FFmpeg executor for Deno/Supabase Edge Functions
 * Supports both Docker and static binary execution
 */

export interface FFmpegOptions {
  command: string;
  onProgress?: (progress: number) => void;
  timeout?: number; // milliseconds
}

export interface FFmpegResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  stderr?: string;
}

/**
 * Execute FFmpeg command using Docker
 */
export async function executeFFmpegDocker(
  options: FFmpegOptions
): Promise<FFmpegResult> {
  const { command, onProgress, timeout = 300000 } = options;

  // Parse FFmpeg command to extract args
  const args = command.split(' ').filter(arg => arg.trim());
  const ffmpegIndex = args.findIndex(arg => arg.includes('ffmpeg'));
  const ffmpegArgs = args.slice(ffmpegIndex + 1);

  try {
    const process = Deno.run({
      cmd: [
        'docker',
        'run',
        '--rm',
        '-v', '/tmp:/tmp',
        'jrottenberg/ffmpeg:latest',
        ...ffmpegArgs
      ],
      stdout: 'piped',
      stderr: 'piped',
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      process.kill('SIGTERM');
    }, timeout);

    // Read stderr for progress
    let stderrOutput = '';
    const decoder = new TextDecoder();
    const stderrReader = process.stderr.readable.getReader();

    (async () => {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;

          const text = decoder.decode(value);
          stderrOutput += text;

          // Parse FFmpeg progress: time=00:00:05.23
          const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (match && onProgress) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const seconds = parseFloat(match[3]);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;

            // Parse duration if available
            const durationMatch = stderrOutput.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
            if (durationMatch) {
              const dHours = parseInt(durationMatch[1]);
              const dMinutes = parseInt(durationMatch[2]);
              const dSeconds = parseFloat(durationMatch[3]);
              const totalDuration = dHours * 3600 + dMinutes * 60 + dSeconds;

              const progress = (totalSeconds / totalDuration) * 100;
              onProgress(Math.min(progress, 100));
            }
          }
        }
      } catch (e) {
        console.error('Error reading stderr:', e);
      }
    })();

    const status = await process.status();
    clearTimeout(timeoutId);

    if (status.success) {
      // Find output file from command
      const outputIndex = ffmpegArgs.findIndex(arg => arg.endsWith('.mp4') || arg.endsWith('.webm'));
      const outputPath = outputIndex >= 0 ? ffmpegArgs[outputIndex].replace(/"/g, '') : undefined;

      return {
        success: true,
        outputPath,
        stderr: stderrOutput
      };
    } else {
      return {
        success: false,
        error: 'FFmpeg process failed',
        stderr: stderrOutput
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute FFmpeg using static binary
 */
export async function executeFFmpegBinary(
  options: FFmpegOptions
): Promise<FFmpegResult> {
  const { command, onProgress, timeout = 300000 } = options;

  try {
    // Assuming ffmpeg binary is in the same directory
    const ffmpegPath = './ffmpeg';

    const args = command.split(' ').filter(arg => arg.trim());
    const ffmpegIndex = args.findIndex(arg => arg.includes('ffmpeg'));
    const ffmpegArgs = args.slice(ffmpegIndex + 1);

    const process = Deno.run({
      cmd: [ffmpegPath, ...ffmpegArgs],
      stdout: 'piped',
      stderr: 'piped',
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      process.kill('SIGTERM');
    }, timeout);

    // Read stderr for progress
    let stderrOutput = '';
    const decoder = new TextDecoder();
    const stderrReader = process.stderr.readable.getReader();

    (async () => {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;

          const text = decoder.decode(value);
          stderrOutput += text;

          // Parse progress
          const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (match && onProgress) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const seconds = parseFloat(match[3]);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;

            const durationMatch = stderrOutput.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
            if (durationMatch) {
              const dHours = parseInt(durationMatch[1]);
              const dMinutes = parseInt(durationMatch[2]);
              const dSeconds = parseFloat(durationMatch[3]);
              const totalDuration = dHours * 3600 + dMinutes * 60 + dSeconds;

              const progress = (totalSeconds / totalDuration) * 100;
              onProgress(Math.min(progress, 100));
            }
          }
        }
      } catch (e) {
        console.error('Error reading stderr:', e);
      }
    })();

    const status = await process.status();
    clearTimeout(timeoutId);

    if (status.success) {
      const outputIndex = ffmpegArgs.findIndex(arg => arg.endsWith('.mp4') || arg.endsWith('.webm'));
      const outputPath = outputIndex >= 0 ? ffmpegArgs[outputIndex].replace(/"/g, '') : undefined;

      return {
        success: true,
        outputPath,
        stderr: stderrOutput
      };
    } else {
      return {
        success: false,
        error: 'FFmpeg process failed',
        stderr: stderrOutput
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Auto-detect and execute FFmpeg
 * Tries Docker first, falls back to binary
 */
export async function executeFFmpeg(
  options: FFmpegOptions
): Promise<FFmpegResult> {
  // Try Docker first
  const dockerResult = await executeFFmpegDocker(options);
  if (dockerResult.success) {
    return dockerResult;
  }

  // Fallback to static binary
  console.log('Docker failed, trying static binary...');
  return await executeFFmpegBinary(options);
}
