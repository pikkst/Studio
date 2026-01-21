# Video Export Backend Deployment Guide

## Kiire Start

```bash
# 1. Setup Supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 2. Deploy andmebaasi schema
supabase db push

# 3. Deploy Edge Function
cd supabase/functions/export-video
supabase functions deploy export-video

# 4. Seadista environment variables Supabase Dashboard-is
# Settings → Edge Functions → Secrets:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
```

## Produktsiooni Setup

### Valik 1: Docker (Recommended)

Edge Function kasutab Docker containerit FFmpeg käivitamiseks.

**Requirements:**
- Docker installed serveris
- Docker socket access Edge Function jaoks

**Supabase Dashboard:**
Settings → Infrastructure → Edge Functions → Docker Access: Enabled

### Valik 2: Static Binary

1. Download FFmpeg static binary:
```bash
wget https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
tar xvf ffmpeg-git-amd64-static.tar.xz
```

2. Copy binary Edge Function kõrvale:
```bash
cp ffmpeg-git-*/ffmpeg supabase/functions/export-video/
chmod +x supabase/functions/export-video/ffmpeg
```

3. Deploy again:
```bash
supabase functions deploy export-video
```

## Test Export Locally

```bash
# Start Docker FFmpeg container
docker-compose up -d ffmpeg

# Test FFmpeg
docker exec studio-ffmpeg ffmpeg -version

# Create test export
curl -X POST http://localhost:54321/functions/v1/export-video \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "test-job-id"}'
```

## Monitoring

### Check Function Logs

```bash
supabase functions logs export-video
```

### Database Queries

```sql
-- Recent export jobs
SELECT id, status, progress, error_message, created_at 
FROM export_jobs 
ORDER BY created_at DESC 
LIMIT 10;

-- Failed exports
SELECT id, error_message, created_at 
FROM export_jobs 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- Average processing time
SELECT 
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
FROM export_jobs 
WHERE status = 'completed';
```

## Troubleshooting

### Error: FFmpeg not found

**Solution:** Ensure Docker is available or static binary is deployed.

### Error: Permission denied

**Solution:** Check file permissions and Docker socket access.

### Error: Timeout

**Solution:** Increase timeout in ffmpeg.ts (default 10 min) or optimize video.

### Error: Out of memory

**Solution:** Reduce video resolution or quality, or increase Edge Function memory limit.

## Performance Tuning

### Faster Processing

```typescript
// Use faster preset (lower quality)
const settings = {
  low: { crf: 28, preset: 'ultrafast', audioBitrate: '96k' },
};
```

### Better Quality

```typescript
// Use slower preset (better quality)
const settings = {
  high: { crf: 15, preset: 'veryslow', audioBitrate: '320k' },
};
```

### GPU Acceleration (Advanced)

Requires GPU-enabled server and NVENC support:

```bash
# Use NVIDIA GPU
-c:v h264_nvenc -preset p7 -tune hq
```

## Cost Optimization

### 1. Limit Export Duration

```sql
-- Add check constraint
ALTER TABLE export_jobs 
ADD CONSTRAINT max_duration 
CHECK ((data->>'maxDuration')::numeric <= 600); -- 10 min max
```

### 2. Queue System

Implement queue to limit concurrent exports:

```typescript
// Check active jobs before creating
const { count } = await supabase
  .from('export_jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'processing');

if (count >= MAX_CONCURRENT) {
  throw new Error('Too many active exports. Please wait.');
}
```

### 3. Cache Results

Store checksums and reuse exports:

```sql
-- Add content_hash column
ALTER TABLE export_jobs ADD COLUMN content_hash TEXT;

-- Check for existing export
SELECT output_url FROM export_jobs 
WHERE content_hash = $1 AND status = 'completed'
LIMIT 1;
```

## Security

### 1. Rate Limiting

```sql
-- Create rate limit table
CREATE TABLE export_rate_limits (
  user_id UUID PRIMARY KEY,
  exports_today INT DEFAULT 0,
  last_reset TIMESTAMP DEFAULT NOW()
);

-- Reset daily
UPDATE export_rate_limits 
SET exports_today = 0, last_reset = NOW() 
WHERE last_reset < NOW() - INTERVAL '1 day';
```

### 2. File Size Limits

```typescript
// Check project size before export
const totalSize = project.assets.reduce((sum, asset) => 
  sum + (asset.file_size || 0), 0
);

if (totalSize > MAX_PROJECT_SIZE) {
  throw new Error('Project too large');
}
```

### 3. Input Validation

```typescript
// Validate URLs
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return url.startsWith('https://') && 
           url.includes('supabase.co/storage/');
  } catch {
    return false;
  }
};
```

## Scaling

### Horizontal Scaling

Edge Functions auto-scale, but consider:

1. **Database connection pooling** - Use Supavisor
2. **Storage CDN** - Enable Cloudflare/Fastly
3. **Queue workers** - Separate processing from API

### Vertical Scaling

Upgrade Edge Function resources:
- More CPU cores
- More RAM
- Faster storage

## Backup & Recovery

```sql
-- Backup export jobs
pg_dump -t export_jobs > export_jobs_backup.sql

-- Restore
psql < export_jobs_backup.sql
```

## Support

- GitHub Issues: https://github.com/pikkst/Studio/issues
- Supabase Discord: https://discord.supabase.com
- Documentation: /supabase/README.md
