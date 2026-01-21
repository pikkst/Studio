import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeFFmpeg } from "./ffmpeg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportJob {
  id: string;
  project_id: string;
  user_id: string;
  format: string;
  quality: string;
  status: string;
}

interface ProjectData {
  id: string;
  title: string;
  data: any;
}

interface TimelineItem {
  id: string;
  assetId: string;
  startTime: number;
  duration: number;
  layer: number;
  transitionIn?: string;
  transitionOut?: string;
  transitionDuration?: number;
  opacity?: number;
  volume?: number;
  filters?: any;
}

interface Asset {
  id: string;
  type: string;
  url: string;
  name: string;
  duration?: number;
  textContent?: string;
  textStyle?: any;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { jobId } = await req.json();

    // Get job details
    const { data: job, error: jobError } = await supabaseClient
      .from('export_jobs')
      .select('*')
      .eq('id', jobId)
      .single() as { data: ExportJob | null; error: any };

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    // Update status to processing
    await supabaseClient
      .from('export_jobs')
      .update({ status: 'processing', progress: 10 })
      .eq('id', jobId);

    // Get project data
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', job.project_id)
      .single() as { data: ProjectData | null; error: any };

    if (projectError || !project) {
      throw new Error('Project not found');
    }

    const projectData = project.data;
    
    // Calculate total timeline duration
    const maxDuration = Math.max(
      ...projectData.timeline.flatMap((track: any) => 
        track.items.map((item: TimelineItem) => item.startTime + item.duration)
      ),
      10
    );

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 20 })
      .eq('id', jobId);

    // Build FFmpeg filter complex for video composition
    const videoSegments: any[] = [];
    const audioSegments: any[] = [];
    const inputs: string[] = [];
    let inputIndex = 0;

    // Collect all video track items sorted by layer and time
    const videoTracks = projectData.timeline.filter((t: any) => t.type === 'video');
    const allVideoItems: Array<{item: TimelineItem, asset: Asset}> = [];
    
    for (const track of videoTracks) {
      for (const item of track.items) {
        const asset = projectData.assets.find((a: Asset) => a.id === item.assetId);
        if (asset && (asset.type === 'video' || asset.type === 'image')) {
          allVideoItems.push({ item, asset });
        }
      }
    }
    
    // Sort by layer (lower layers first = background first)
    allVideoItems.sort((a, b) => a.item.layer - b.item.layer);

    // Process video items
    const processedVideoLabels: string[] = [];
    
    for (let i = 0; i < allVideoItems.length; i++) {
      const { item, asset } = allVideoItems[i];
      const inputIdx = inputIndex++;
      inputs.push(`-i "${asset.url}"`);
      
      let filterChain = `[${inputIdx}:v]`;
      
      if (asset.type === 'image') {
        // Image: loop and set duration
        filterChain += `loop=loop=-1:size=1:start=0,setpts=PTS-STARTPTS,`;
        filterChain += `trim=duration=${item.duration},`;
      } else {
        // Video: trim to duration
        filterChain += `trim=0:${item.duration},setpts=PTS-STARTPTS,`;
      }
      
      // Scale and pad to 1280x720
      filterChain += `scale=1280:720:force_original_aspect_ratio=decrease,`;
      filterChain += `pad=1280:720:(ow-iw)/2:(oh-ih)/2,`;
      filterChain += `setsar=1,`;
      
      // Apply filters
      if (item.filters) {
        if (item.filters.brightness !== undefined) {
          const b = item.filters.brightness;
          filterChain += `eq=brightness=${b}:,`;
        }
        if (item.filters.contrast !== undefined) {
          const c = item.filters.contrast;
          filterChain += `eq=contrast=${c}:,`;
        }
        if (item.filters.saturation !== undefined) {
          const s = item.filters.saturation;
          filterChain += `eq=saturation=${s}:,`;
        }
        if (item.filters.blur !== undefined && item.filters.blur > 0) {
          filterChain += `boxblur=${item.filters.blur}:,`;
        }
      }
      
      // Apply opacity
      const opacity = item.opacity !== undefined ? item.opacity : 1;
      if (opacity < 1) {
        filterChain += `format=rgba,colorchannelmixer=aa=${opacity},`;
      }
      
      // Apply transition IN
      if (item.transitionIn && item.transitionIn !== 'none') {
        const transDur = item.transitionDuration || 0.5;
        filterChain += buildTransitionFilter(item.transitionIn, transDur, 'in') + ',';
      }
      
      // Apply transition OUT
      if (item.transitionOut && item.transitionOut !== 'none') {
        const transDur = item.transitionDuration || 0.5;
        const outStart = item.duration - transDur;
        filterChain += buildTransitionFilter(item.transitionOut, transDur, 'out', outStart) + ',';
      }
      
      // Add timing offset
      filterChain += `tpad=start_duration=${item.startTime}:start_mode=add:color=black,`;
      filterChain += `trim=0:${maxDuration},setpts=PTS-STARTPTS`;
      
      const label = `v${i}`;
      filterChain += `[${label}]`;
      processedVideoLabels.push(label);
      
      videoSegments.push(filterChain);
    }

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 40 })
      .eq('id', jobId);

    // Process audio tracks
    const audioTracks = projectData.timeline.filter((t: any) => t.type === 'audio');
    const processedAudioLabels: string[] = [];
    let audioIdx = 0;
    
    for (const track of audioTracks) {
      for (const item of track.items) {
        const asset = projectData.assets.find((a: Asset) => a.id === item.assetId);
        if (!asset || asset.type !== 'audio') continue;
        
        const inputIdx = inputIndex++;
        inputs.push(`-i "${asset.url}"`);
        
        let audioFilter = `[${inputIdx}:a]`;
        audioFilter += `atrim=0:${item.duration},asetpts=PTS-STARTPTS,`;
        
        // Apply volume
        const volume = item.volume !== undefined ? item.volume : (track.volume || 1);
        if (volume !== 1) {
          audioFilter += `volume=${volume},`;
        }
        
        // Add delay for start time
        audioFilter += `adelay=${item.startTime * 1000}|${item.startTime * 1000},`;
        audioFilter += `apad=pad_dur=${maxDuration}`;
        
        const label = `a${audioIdx++}`;
        audioFilter += `[${label}]`;
        processedAudioLabels.push(label);
        
        audioSegments.push(audioFilter);
      }
    }

    // Also extract audio from video files if present
    for (let i = 0; i < allVideoItems.length; i++) {
      const { item, asset } = allVideoItems[i];
      if (asset.type !== 'video') continue;
      
      const inputIdx = i; // Same index as video input
      let audioFilter = `[${inputIdx}:a]`;
      audioFilter += `atrim=0:${item.duration},asetpts=PTS-STARTPTS,`;
      
      const volume = item.volume !== undefined ? item.volume : 1;
      if (volume !== 1) {
        audioFilter += `volume=${volume},`;
      }
      
      audioFilter += `adelay=${item.startTime * 1000}|${item.startTime * 1000},`;
      audioFilter += `apad=pad_dur=${maxDuration}`;
      
      const label = `a${audioIdx++}`;
      audioFilter += `[${label}]`;
      processedAudioLabels.push(label);
      
      audioSegments.push(audioFilter);
    }

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 60 })
      .eq('id', jobId);

    // Build complete filter_complex
    let filterComplex = '';
    
    // Add all video filters
    filterComplex += videoSegments.join(';') + ';';
    
    // Overlay all video layers
    if (processedVideoLabels.length > 0) {
      let overlayChain = `[${processedVideoLabels[0]}]`;
      for (let i = 1; i < processedVideoLabels.length; i++) {
        overlayChain += `[${processedVideoLabels[i]}]overlay=format=auto`;
        if (i < processedVideoLabels.length - 1) {
          overlayChain += `[tmp${i}];[tmp${i}]`;
        }
      }
      overlayChain += '[vout]';
      filterComplex += overlayChain + ';';
    }
    
    // Add all audio filters
    if (audioSegments.length > 0) {
      filterComplex += audioSegments.join(';') + ';';
      
      // Mix all audio
      const audioInputs = processedAudioLabels.map(l => `[${l}]`).join('');
      filterComplex += `${audioInputs}amix=inputs=${processedAudioLabels.length}:duration=longest:dropout_transition=2[aout]`;
    }

    // Quality settings
    const qualitySettings = {
      low: { crf: 28, preset: 'fast', audioBitrate: '128k' },
      medium: { crf: 23, preset: 'medium', audioBitrate: '192k' },
      high: { crf: 18, preset: 'slow', audioBitrate: '256k' }
    };
    
    const settings = qualitySettings[job.quality as keyof typeof qualitySettings] || qualitySettings.high;

    // Build FFmpeg command
    const outputFilename = `${job.user_id}/${jobId}.${job.format}`;
    const outputPath = `/tmp/${jobId}.${job.format}`;
    
    let ffmpegCmd = 'ffmpeg -y ';
    ffmpegCmd += inputs.join(' ') + ' ';
    ffmpegCmd += `-filter_complex "${filterComplex}" `;
    
    if (processedVideoLabels.length > 0) {
      ffmpegCmd += '-map "[vout]" ';
    } else {
      // No video, create black background
      ffmpegCmd += `-f lavfi -i color=c=black:s=1280x720:d=${maxDuration} -map 0:v `;
    }
    
    if (processedAudioLabels.length > 0) {
      ffmpegCmd += '-map "[aout]" ';
    } else {
      // No audio, add silent audio
      ffmpegCmd += `-f lavfi -i anullsrc=r=48000:cl=stereo -map 1:a `;
    }
    
    // Encoding settings
    ffmpegCmd += `-c:v libx264 -crf ${settings.crf} -preset ${settings.preset} `;
    ffmpegCmd += `-c:a aac -b:a ${settings.audioBitrate} `;
    ffmpegCmd += `-pix_fmt yuv420p -movflags +faststart `;
    ffmpegCmd += `-t ${maxDuration} `;
    ffmpegCmd += `"${outputPath}"`;

    console.log('FFmpeg command:', ffmpegCmd);

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 70 })
      .eq('id', jobId);

    // Execute FFmpeg
    console.log('Processing video with FFmpeg...');
    const ffmpegResult = await executeFFmpeg({
      command: ffmpegCmd,
      onProgress: async (progress) => {
        // Map FFmpeg progress (0-100) to our progress range (70-90)
        const mappedProgress = 70 + (progress * 0.2);
        await supabaseClient
          .from('export_jobs')
          .update({ progress: Math.round(mappedProgress) })
          .eq('id', jobId);
      },
      timeout: 600000 // 10 minutes
    });

    if (!ffmpegResult.success) {
      throw new Error(`FFmpeg failed: ${ffmpegResult.error}\n${ffmpegResult.stderr}`);
    }

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 90 })
      .eq('id', jobId);

    // Upload to Supabase Storage
    console.log('Uploading to storage...');
    const fileData = await Deno.readFile(outputPath);
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('exports')
      .upload(outputFilename, fileData, {
        contentType: job.format === 'mp4' ? 'video/mp4' : 'video/webm',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('exports')
      .getPublicUrl(outputFilename);

    // Clean up temp file
    try {
      await Deno.remove(outputPath);
    } catch (e) {
      console.warn('Could not remove temp file:', e);
    }

    await supabaseClient
      .from('export_jobs')
      .update({ progress: 95 })
      .eq('id', jobId);

    // Update job as completed
    await supabaseClient
      .from('export_jobs')
      .update({
        status: 'completed',
        progress: 100,
        output_url: publicUrl,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    return new Response(
      JSON.stringify({ success: true, jobId, outputUrl: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Export error:', error);
    
    const { jobId } = await req.json().catch(() => ({}));
    if (jobId) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseClient
        .from('export_jobs')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error'
        })
        .eq('id', jobId);
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

// Helper function to build transition filters
function buildTransitionFilter(
  type: string, 
  duration: number, 
  direction: 'in' | 'out',
  startTime: number = 0
): string {
  switch (type) {
    case 'fade':
      if (direction === 'in') {
        return `fade=t=in:st=0:d=${duration}`;
      } else {
        return `fade=t=out:st=${startTime}:d=${duration}`;
      }
    
    case 'dissolve':
      // Similar to fade
      if (direction === 'in') {
        return `fade=t=in:st=0:d=${duration}:alpha=1`;
      } else {
        return `fade=t=out:st=${startTime}:d=${duration}:alpha=1`;
      }
    
    case 'wipe':
      // Horizontal wipe using crop
      if (direction === 'in') {
        return `crop=w='if(lt(t,${duration}),iw*t/${duration},iw)':h=ih:x=0:y=0`;
      } else {
        return `crop=w='if(gt(t,${startTime}),iw*(${startTime}+${duration}-t)/${duration},iw)':h=ih:x=0:y=0`;
      }
    
    case 'slide':
      // Slide in from right or slide out to left
      if (direction === 'in') {
        return `fade=t=in:st=0:d=${duration},zoompan=z='min(zoom+0.002,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720`;
      } else {
        return `fade=t=out:st=${startTime}:d=${duration}`;
      }
    
    default:
      return '';
  }
}

