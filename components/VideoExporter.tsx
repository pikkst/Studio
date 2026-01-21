import React, { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { ProjectState } from '../types';

interface VideoExporterProps {
  project: ProjectState;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ project, isOpen, onClose }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high');

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);

    try {
      // Get timeline duration
      const maxDuration = Math.max(
        ...project.timeline.flatMap(track => 
          track.items.map(item => item.startTime + item.duration)
        ),
        10
      );

      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;

      // Setup MediaRecorder
      const stream = canvas.captureStream(30);
      
      // Add audio tracks
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: format === 'mp4' ? 'video/webm;codecs=h264' : 'video/webm',
        videoBitsPerSecond: quality === 'high' ? 8000000 : quality === 'medium' ? 4000000 : 2000000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
        onClose();
      };

      mediaRecorder.start();

      // Render frames
      const fps = 30;
      const frameDuration = 1 / fps;
      let currentTime = 0;

      const renderFrame = () => {
        if (currentTime >= maxDuration) {
          mediaRecorder.stop();
          return;
        }

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render video items at current time
        const videoTracks = project.timeline.filter(t => t.type === 'video');
        const activeItems = videoTracks
          .flatMap(track => track.items.map(item => ({ item, track })))
          .filter(({ item }) => currentTime >= item.startTime && currentTime < item.startTime + item.duration)
          .sort((a, b) => a.item.layer - b.item.layer);

        activeItems.forEach(({ item }) => {
          const asset = project.assets.find(a => a.id === item.assetId);
          if (!asset) return;

          // This is simplified - in production you'd need to load and sync media
          if (asset.type === 'image' && asset.url) {
            const img = new Image();
            img.src = asset.url;
            if (img.complete) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
          } else if (asset.type === 'text' && asset.textContent) {
            const style = asset.textStyle || { fontSize: 48, color: '#fff', fontFamily: 'Inter', align: 'center' };
            ctx.font = `${style.fontSize}px ${style.fontFamily}`;
            ctx.fillStyle = style.color;
            ctx.textAlign = style.align as CanvasTextAlign;
            const x = style.align === 'center' ? canvas.width / 2 : style.align === 'right' ? canvas.width - 40 : 40;
            ctx.fillText(asset.textContent, x, canvas.height / 2);
          }
        });

        currentTime += frameDuration;
        setProgress((currentTime / maxDuration) * 100);
        setTimeout(renderFrame, frameDuration * 1000);
      };

      renderFrame();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error as Error).message);
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center">
              <Download size={20} className="text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Export Video</h2>
              <p className="text-xs text-zinc-500">Render your project as video</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as 'mp4' | 'webm')} className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none">
              <option value="mp4">MP4 (H.264)</option>
              <option value="webm">WebM</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as 'low' | 'medium' | 'high')} className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none">
              <option value="high">High (8 Mbps)</option>
              <option value="medium">Medium (4 Mbps)</option>
              <option value="low">Low (2 Mbps)</option>
            </select>
          </div>

          {isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Exporting...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-800/50 bg-zinc-950/50">
          <button onClick={onClose} disabled={isExporting} className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleExport} disabled={isExporting} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2">
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Exporting...' : 'Export Video'}
          </button>
        </div>
      </div>
    </div>
  );
};
