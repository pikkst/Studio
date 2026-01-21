import React, { useState, useEffect } from 'react';
import { Download, Loader2, X, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { ProjectState } from '../types';
import { supabaseService } from '../services/supabaseService';

interface VideoExporterProps {
  project: ProjectState;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const VideoExporter: React.FC<VideoExporterProps> = ({ project, isOpen, onClose, userId }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'creating' | 'processing' | 'completed' | 'failed'>('idle');
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [outputUrl, setOutputUrl] = useState<string>('');

  useEffect(() => {
    if (!jobId || !isOpen) return;

    // Subscribe to job updates
    const subscription = supabaseService.subscribeToExportJob(jobId, (job) => {
      setStatus(job.status);
      setProgress(job.progress || 0);
      
      if (job.status === 'completed') {
        setOutputUrl(job.output_url);
        setIsExporting(false);
      } else if (job.status === 'failed') {
        setErrorMessage(job.error_message || 'Export failed');
        setIsExporting(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [jobId, isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setProgress(0);
      setErrorMessage('');
      setOutputUrl('');
      setJobId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setStatus('creating');
    setProgress(0);
    setErrorMessage('');

    try {
      // Validate project has content
      if (project.timeline.length === 0 || project.assets.length === 0) {
        throw new Error('Project is empty. Add some media to the timeline first.');
      }

      // First save the project to ensure latest data
      await supabaseService.saveProject(project, userId);

      // Create export job
      const job = await supabaseService.createExportJob(
        project.id,
        userId,
        format,
        quality
      );

      setJobId(job.id);
      setStatus('processing');
    } catch (error) {
      console.error('Export failed:', error);
      setStatus('failed');
      setErrorMessage((error as Error).message);
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (outputUrl) {
      const a = document.createElement('a');
      a.href = outputUrl;
      a.download = `${project.title}.${format}`;
      a.click();
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 size={20} className="text-violet-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 size={20} className="text-green-500" />;
      case 'failed':
        return <XCircle size={20} className="text-red-500" />;
      default:
        return <Clock size={20} className="text-zinc-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'creating':
        return 'Creating export job...';
      case 'processing':
        return 'Processing video...';
      case 'completed':
        return 'Export completed!';
      case 'failed':
        return 'Export failed';
      default:
        return 'Ready to export';
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
          {/* Info Alert */}
          <div className="flex items-start gap-3 p-3 bg-violet-950/30 border border-violet-900/50 rounded-lg">
            <AlertCircle size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-violet-300">Server-Side Processing</p>
              <p className="text-xs text-violet-400/70 mt-1">
                Your video will be rendered on our servers using FFmpeg with full support for transitions, effects, and high-quality encoding.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as 'mp4' | 'webm')} className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none" disabled={isExporting}>
              <option value="mp4">MP4 (H.264)</option>
              <option value="webm">WebM (VP8)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as 'low' | 'medium' | 'high')} className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none" disabled={isExporting}>
              <option value="high">High (Best Quality)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="low">Low (Faster)</option>
            </select>
          </div>

          {isExporting && (
            <div className="space-y-3 p-4 bg-zinc-950 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">{getStatusText()}</p>
                  {status === 'processing' && (
                    <p className="text-xs text-zinc-500 mt-1">This may take a few minutes...</p>
                  )}
                </div>
                <span className="text-sm font-bold text-violet-400">{progress.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all duration-300" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            </div>
          )}

          {status === 'failed' && errorMessage && (
            <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-lg">
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          {status === 'completed' && outputUrl && (
            <div className="p-4 bg-green-950/50 border border-green-900/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-green-400" />
                <p className="text-sm font-medium text-green-400">Your video is ready!</p>
              </div>
              <button 
                onClick={handleDownload}
                className="w-full mt-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Download size={16} />
                Download Video
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-800/50 bg-zinc-950/50">
          <button 
            onClick={onClose} 
            disabled={isExporting && status === 'processing'} 
            className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            {status === 'completed' ? 'Close' : 'Cancel'}
          </button>
          {status !== 'completed' && (
            <button 
              onClick={handleExport} 
              disabled={isExporting} 
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Start Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
