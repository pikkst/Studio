/**
 * Client-side video processing using FFmpeg.wasm
 * Processes videos directly in the browser with full FFmpeg support
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { ProjectState, TimelineItem, Asset } from '../types';

class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private loading = false;

  /**
   * Initialize FFmpeg.wasm
   */
  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.loaded) return;
    if (this.loading) {
      // Wait for existing load to complete
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;
    onProgress?.(10);

    try {
      this.ffmpeg = new FFmpeg();

      // Load FFmpeg core
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      this.ffmpeg.on('progress', ({ progress, time }) => {
        onProgress?.(20 + progress * 70); // Map 0-1 to 20-90%
      });

      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.loaded = true;
      onProgress?.(100);
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to initialize video processor');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Export project to video using FFmpeg.wasm
   */
  async exportVideo(
    project: ProjectState,
    format: 'mp4' | 'webm' = 'mp4',
    quality: 'low' | 'medium' | 'high' = 'high',
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.ffmpeg || !this.loaded) {
      throw new Error('FFmpeg not loaded');
    }

    onProgress?.(0);

    try {
      // Calculate total duration
      const maxDuration = Math.max(
        ...project.timeline.flatMap(track => 
          track.items.map(item => item.startTime + item.duration)
        ),
        10
      );

      onProgress?.(5);

      // Collect all assets that need to be downloaded
      const usedAssetIds = new Set<string>();
      project.timeline.forEach(track => {
        track.items.forEach(item => usedAssetIds.add(item.assetId));
      });

      const assets = project.assets.filter(a => usedAssetIds.has(a.id));
      
      onProgress?.(10);

      // Download all assets to FFmpeg virtual filesystem
      const assetFiles: Map<string, string> = new Map();
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        if (asset.type === 'text') continue; // Skip text assets

        const fileName = `input_${i}.${asset.type === 'image' ? 'png' : asset.type === 'audio' ? 'mp3' : 'mp4'}`;
        
        try {
          const data = await fetchFile(asset.url);
          await this.ffmpeg.writeFile(fileName, data);
          assetFiles.set(asset.id, fileName);
        } catch (err) {
          console.error(`Failed to load asset ${asset.name}:`, err);
          throw new Error(`Failed to load media: ${asset.name}`);
        }

        onProgress?.(10 + (i / assets.length) * 20);
      }

      onProgress?.(30);

      // Build FFmpeg filter_complex command (similar to backend)
      const videoItems: Array<{item: TimelineItem, asset: Asset, fileName: string}> = [];
      const audioItems: Array<{item: TimelineItem, asset: Asset, fileName: string}> = [];

      // Collect video items
      project.timeline
        .filter(t => t.type === 'video')
        .forEach(track => {
          track.items.forEach(item => {
            const asset = project.assets.find(a => a.id === item.assetId);
            const fileName = assetFiles.get(item.assetId);
            if (asset && fileName && (asset.type === 'image' || asset.type === 'video')) {
              videoItems.push({ item, asset, fileName });
            }
          });
        });

      // Collect audio items
      project.timeline
        .filter(t => t.type === 'audio')
        .forEach(track => {
          track.items.forEach(item => {
            const asset = project.assets.find(a => a.id === item.assetId);
            const fileName = assetFiles.get(item.assetId);
            if (asset && fileName && asset.type === 'audio') {
              audioItems.push({ item, asset, fileName });
            }
          });
        });

      // Sort video items by layer
      videoItems.sort((a, b) => a.item.layer - b.item.layer);

      // Build filter_complex
      let filterComplex = '';
      const videoLabels: string[] = [];

      // Process video layers
      videoItems.forEach((videoItem, i) => {
        const { item, asset, fileName } = videoItem;
        
        let filter = `[${i}:v]`;
        
        if (asset.type === 'image') {
          filter += `loop=loop=-1:size=1:start=0,setpts=PTS-STARTPTS,trim=duration=${item.duration},`;
        } else {
          filter += `trim=0:${item.duration},setpts=PTS-STARTPTS,`;
        }
        
        filter += `scale=1280:720:force_original_aspect_ratio=decrease,`;
        filter += `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,`;
        
        // Apply opacity
        const opacity = item.opacity ?? 1;
        if (opacity < 1) {
          filter += `format=rgba,colorchannelmixer=aa=${opacity},`;
        }
        
        // Add timing
        filter += `tpad=start_duration=${item.startTime}:start_mode=add:color=black,`;
        filter += `trim=0:${maxDuration},setpts=PTS-STARTPTS[v${i}]`;
        
        filterComplex += filter + ';';
        videoLabels.push(`v${i}`);
      });

      // Overlay video layers
      if (videoLabels.length > 0) {
        let overlayChain = `[${videoLabels[0]}]`;
        for (let i = 1; i < videoLabels.length; i++) {
          overlayChain += `[${videoLabels[i]}]overlay=format=auto`;
          if (i < videoLabels.length - 1) {
            overlayChain += `[tmp${i}];[tmp${i}]`;
          }
        }
        overlayChain += '[vout]';
        filterComplex += overlayChain + ';';
      }

      // Process audio
      const audioLabels: string[] = [];
      audioItems.forEach((audioItem, i) => {
        const { item, fileName } = audioItem;
        const inputIdx = videoItems.length + i;
        
        const volume = item.volume ?? 1;
        const delay = Math.round(item.startTime * 1000);
        
        let filter = `[${inputIdx}:a]`;
        filter += `atrim=0:${item.duration},asetpts=PTS-STARTPTS,`;
        if (volume !== 1) {
          filter += `volume=${volume},`;
        }
        filter += `adelay=${delay}|${delay},`;
        filter += `apad=pad_dur=${maxDuration}[a${i}]`;
        
        filterComplex += filter + ';';
        audioLabels.push(`a${i}`);
      });

      // Mix audio
      if (audioLabels.length > 0) {
        const audioInputs = audioLabels.map(l => `[${l}]`).join('');
        filterComplex += `${audioInputs}amix=inputs=${audioLabels.length}:duration=longest[aout]`;
      }

      // Quality settings
      const qualitySettings = {
        low: { crf: '28', preset: 'ultrafast', audioBitrate: '128k' },
        medium: { crf: '23', preset: 'fast', audioBitrate: '192k' },
        high: { crf: '18', preset: 'medium', audioBitrate: '256k' }
      };
      const settings = qualitySettings[quality];

      // Build FFmpeg command arguments
      const args: string[] = [];
      
      // Input files
      videoItems.forEach(v => {
        args.push('-i', v.fileName);
      });
      audioItems.forEach(a => {
        args.push('-i', a.fileName);
      });

      // Filter complex
      if (filterComplex) {
        args.push('-filter_complex', filterComplex);
      }

      // Output mapping
      if (videoLabels.length > 0) {
        args.push('-map', '[vout]');
      } else {
        // Create black background
        args.push('-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=${maxDuration}`, '-map', '0:v');
      }

      if (audioLabels.length > 0) {
        args.push('-map', '[aout]');
      } else {
        // Silent audio
        args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '1:a');
      }

      // Encoding settings
      args.push(
        '-c:v', 'libx264',
        '-crf', settings.crf,
        '-preset', settings.preset,
        '-c:a', 'aac',
        '-b:a', settings.audioBitrate,
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-t', maxDuration.toString(),
        `output.${format}`
      );

      console.log('FFmpeg args:', args.join(' '));

      onProgress?.(35);

      // Execute FFmpeg
      await this.ffmpeg.exec(args);

      onProgress?.(90);

      // Read output file
      const data = await this.ffmpeg.readFile(`output.${format}`);
      const blob = new Blob([data], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });

      onProgress?.(95);

      // Cleanup
      await this.cleanup();

      onProgress?.(100);

      return blob;
    } catch (error) {
      console.error('Export error:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Clean up FFmpeg filesystem
   */
  private async cleanup(): Promise<void> {
    if (!this.ffmpeg) return;

    try {
      const files = await this.ffmpeg.listDir('/');
      for (const file of files) {
        if (file.name && file.name !== '.' && file.name !== '..') {
          try {
            await this.ffmpeg.deleteFile(file.name);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }

  /**
   * Check if FFmpeg is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}

export const ffmpegService = new FFmpegService();
