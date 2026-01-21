# Supabase Backend Video Export System

## Ülevaade

Video export süsteem kasutab täielikult server-side processing'ut FFmpeg'iga. Kõik video renderimised, transitions, filtrid ja audio mixing toimuvad backend'is.

## Omadused

✅ **FFmpeg-põhine töötlemine** - Professionaalne video encoding  
✅ **Transition support** - Fade, dissolve, wipe, slide effects  
✅ **Video filters** - Brightness, contrast, saturation, blur  
✅ **Multi-layer compositing** - Overlay mitmed videod/pildid  
✅ **Audio mixing** - Mix mitmed audio trackid kokku  
✅ **Realtime progress** - WebSocket subscription job status'e jaoks  
✅ **High-quality output** - MP4 (H.264) ja WebM (VP8) formaadid

## Database Schema

Käivitage SQL skript andmebaasi seadistamiseks:

```bash
# Kopeeri supabase-schema.sql Supabase SQL editorisse
# Või kasuta CLI:
supabase db push
```

## Edge Function Setup

### 1. Installi Supabase CLI

```bash
npm install -g supabase
```

### 2. Login ja Link

```bash
supabase login
supabase link --project-ref your-project-ref
```

### 3. Deploy Function

```bash
supabase functions deploy export-video
```

### 4. Environment Variables

Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Production FFmpeg Setup

### Docker Container Approach (Recommended)

Edge Function peaks kasutama Docker containerit FFmpeg'i käivitamiseks:

```typescript
// Example Deno FFmpeg execution
const process = Deno.run({
  cmd: [
    "docker", "run", "--rm",
    "-v", "/tmp:/tmp",
    "jrottenberg/ffmpeg:latest",
    ...ffmpegArgs
  ],
  stdout: "piped",
  stderr: "piped"
});

// Monitor progress
const decoder = new TextDecoder();
for await (const chunk of process.stderr.readable) {
  const text = decoder.decode(chunk);
  // Parse FFmpeg progress: time=00:00:05.23
  const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (match) {
    const seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
    const progress = (seconds / totalDuration) * 100;
    // Update job progress in database
  }
}

const { code } = await process.status();
```

### Alternative: Statically Compiled FFmpeg

Download FFmpeg binary ja include Edge Function kõrval:

```bash
# Download static FFmpeg
wget https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
tar xvf ffmpeg-git-amd64-static.tar.xz

# Copy to functions directory
cp ffmpeg-git-*/ffmpeg supabase/functions/export-video/
```

## Video Processing Pipeline

### 1. Timeline Processing

- Sorteeritakse video itemid layer ja aja järgi
- Iga asset laaditakse input'ina
- Builditi FFmpeg filter_complex chain

### 2. Video Composition

```
[Input 0] → Scale + Pad → Filters → Transitions → Tpad (timing) → [v0]
[Input 1] → Scale + Pad → Filters → Transitions → Tpad (timing) → [v1]
...
[v0][v1]... → Overlay → [vout]
```

### 3. Audio Mixing

```
[Audio 0] → Trim → Volume → Delay → [a0]
[Audio 1] → Trim → Volume → Delay → [a1]
...
[a0][a1]... → AMix → [aout]
```

### 4. Final Encoding

```bash
ffmpeg -i input1 -i input2 ... \
  -filter_complex "..." \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -crf 18 -preset slow \
  -c:a aac -b:a 256k \
  -pix_fmt yuv420p \
  -movflags +faststart \
  output.mp4
```

## Transition Effects Implementation

### Fade

```
fade=t=in:st=0:d=0.5        # Fade in
fade=t=out:st=5:d=0.5       # Fade out
```

### Dissolve (Alpha Fade)

```
fade=t=in:st=0:d=0.5:alpha=1
```

### Wipe (Horizontal)

```
crop=w='if(lt(t,0.5),iw*t/0.5,iw)':h=ih:x=0:y=0
```

### Slide (Zoom + Fade)

```
zoompan=z='min(zoom+0.002,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'
```

## Export Job Flow

1. **Frontend** - User clicks "Export"
   - Saves project to database
   - Creates `export_job` record
   - Triggers Edge Function

2. **Edge Function** - Receives job ID
   - Fetches project data and assets
   - Builds FFmpeg command
   - Executes FFmpeg (Docker/Binary)
   - Monitors progress → Updates DB
   - Uploads result to Storage
   - Marks job as completed

3. **Frontend** - Subscribes to job updates
   - Realtime progress bar
   - Download button on completion

## Storage Buckets

### `media`
- User uploaded assets
- Videos, images, audio files
- Public read access

### `exports`
- Rendered export files
- MP4/WebM outputs
- Public read for users

## Realtime Progress Tracking

```typescript
// Subscribe to export job updates
const subscription = supabase
  .channel(`export_job_${jobId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'export_jobs',
      filter: `id=eq.${jobId}`
    },
    (payload) => {
      const { status, progress, output_url } = payload.new;
      // Update UI
    }
  )
  .subscribe();
```

## Frontend Environment Variables

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Troubleshooting

### FFmpeg not found
Ensure FFmpeg is available in Edge Function environment (Docker or static binary).

### CORS errors
Check Storage bucket policies allow public access.

### Slow processing
- Use lower quality preset
- Reduce video resolution
- Check server resources

### Audio out of sync
- Ensure `adelay` values are in milliseconds
- Use `apad` to extend audio to full duration

## Performance Optimization

1. **Parallel Processing** - Process multiple jobs with queue system
2. **CDN Cache** - Serve exports from CDN
3. **Thumbnail Generation** - Pre-generate thumbnails for preview
4. **Progressive Upload** - Stream output directly to Storage
5. **Resource Limits** - Set timeout and memory limits per job

## Cost Estimation

- Edge Function: ~$0.40 per 1M invocations
- Storage: ~$0.021 per GB/month
- Bandwidth: ~$0.09 per GB
- Typical 5-min video export: ~$0.001-0.01

## Future Enhancements

- [ ] GPU-accelerated encoding (NVENC, VideoToolbox)
- [ ] Batch export multiple projects
- [ ] Custom resolution/bitrate settings
- [ ] Watermark overlay support
- [ ] Subtitle/caption rendering
- [ ] Multi-format export (GIF, MOV)
- [ ] Export presets (YouTube, Instagram, TikTok)

