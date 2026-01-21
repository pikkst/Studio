
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Video, 
  Image as ImageIcon, 
  Music, 
  Type as TypeIcon, 
  Layers, 
  Zap, 
  Download, 
  Share2, 
  Trash2, 
  Sparkles, 
  MessageSquare, 
  Mic, 
  Settings, 
  X, 
  Send, 
  Loader2, 
  Search, 
  ExternalLink, 
  ChevronRight, 
  ChevronLeft, 
  Upload,
  Volume2,
  VolumeX,
  GripHorizontal,
  Scissors,
  Eraser,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Asset, ProjectState, TimelineTrack, AIServiceMode, TimelineItem } from './types';
import { geminiService } from './services/geminiService';

/**
 * Component to render a static waveform for an audio asset.
 */
const AudioWaveform: React.FC<{ url: string; color: string }> = ({ url, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    const draw = async () => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        if (!active || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color;

        for (let i = 0; i < canvas.width; i++) {
          let min = 1.0;
          let max = -1.0;
          for (let j = 0; j < step; j++) {
            const datum = data[i * step + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
          ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
      } catch (e) {
        console.warn("Waveform visualization error:", e);
      }
    };

    draw();
    return () => { active = false; };
  }, [url, color]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" />;
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectState>({
    id: '1',
    title: 'Lumina Masterpiece',
    assets: [],
    timeline: [
      { id: 'v1', name: 'Video 1', type: 'video', volume: 1, items: [] },
      { id: 'v2', name: 'Video 2', type: 'video', volume: 1, items: [] },
      { id: 'a1', name: 'Background', type: 'audio', volume: 0.5, items: [] },
      { id: 'a2', name: 'Voiceover', type: 'audio', volume: 1, items: [] }
    ]
  });

  const [activeTab, setActiveTab] = useState<'media' | 'search' | 'layers' | 'settings'>('media');
  const [aiMode, setAiMode] = useState<AIServiceMode>(AIServiceMode.CHAT);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(true);
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string, links?: {title: string, uri: string}[]}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Interaction states
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingItem, setDraggingItem] = useState<{itemId: string, trackId: string} | null>(null);
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [resizingItem, setResizingItem] = useState<{itemId: string, side: 'start' | 'end', initialX: number, initialStart: number, initialDuration: number} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playheadIntervalRef = useRef<number | null>(null);

  const PIXELS_PER_SECOND = 30; // Increased for better resolution
  const HEADER_WIDTH = 160;

  // --- Scroll Synchronization ---
  useEffect(() => {
    const handleScroll = () => {
      if (timelineContentRef.current && rulerScrollRef.current) {
        rulerScrollRef.current.scrollLeft = timelineContentRef.current.scrollLeft;
      }
    };
    const content = timelineContentRef.current;
    content?.addEventListener('scroll', handleScroll);
    return () => content?.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Audio Buffer & Playback Engine ---
  useEffect(() => {
    const audioItems = project.timeline.flatMap(t => t.items).filter(item => {
      const asset = project.assets.find(a => a.id === item.assetId);
      return asset?.type === 'audio';
    });

    const itemIds = new Set(audioItems.map(i => i.id));
    
    // Clean up old elements
    for (const id of audioElementsRef.current.keys()) {
      if (!itemIds.has(id)) {
        const audio = audioElementsRef.current.get(id);
        if (audio) {
          audio.pause();
          audio.src = "";
          audio.load();
        }
        audioElementsRef.current.delete(id);
      }
    }

    // Initialize/Pre-buffer new elements
    audioItems.forEach(item => {
      if (!audioElementsRef.current.has(item.id)) {
        const asset = project.assets.find(a => a.id === item.assetId);
        if (asset) {
          const audio = new Audio(asset.url);
          audio.preload = "auto";
          audio.onwaiting = () => setIsBuffering(true);
          audio.oncanplay = () => setIsBuffering(false);
          audioElementsRef.current.set(item.id, audio);
        }
      }
    });
  }, [project.timeline, project.assets]);

  useEffect(() => {
    const syncAudio = () => {
      audioElementsRef.current.forEach((audio, itemId) => {
        let item: TimelineItem | undefined;
        let parentTrack: TimelineTrack | undefined;
        for (const track of project.timeline) {
          item = track.items.find(i => i.id === itemId);
          if (item) {
            parentTrack = track;
            break;
          }
        }

        if (!item || !parentTrack) return;
        
        const isInside = currentTime >= item.startTime && currentTime < (item.startTime + item.duration);
        audio.volume = parentTrack.volume;

        if (isPlaying && isInside) {
          const targetTime = currentTime - item.startTime;
          // IMPORTANT: Only seek if we are drifted by more than 0.2s to prevent "stuttering"
          if (Math.abs(audio.currentTime - targetTime) > 0.2) {
            audio.currentTime = targetTime;
          }
          if (audio.paused) {
             audio.play().catch(e => console.warn("Playback prevented", e));
          }
        } else {
          if (!audio.paused) audio.pause();
          // Keep audio position synced even when paused for instant resume
          const targetTimeWhenPaused = Math.max(0, currentTime - item.startTime);
          if (Math.abs(audio.currentTime - targetTimeWhenPaused) > 0.1) {
             audio.currentTime = targetTimeWhenPaused;
          }
        }
      });
    };

    if (isPlaying) {
      const startTimeRef = performance.now() - (currentTime * 1000);
      const update = (now: number) => {
        const elapsed = (now - startTimeRef) / 1000;
        setCurrentTime(elapsed);
        syncAudio();
        playheadIntervalRef.current = requestAnimationFrame(update);
      };
      playheadIntervalRef.current = requestAnimationFrame(update);
    } else {
      if (playheadIntervalRef.current) cancelAnimationFrame(playheadIntervalRef.current);
      syncAudio(); // Single sync on pause
    }
    return () => {
      if (playheadIntervalRef.current) cancelAnimationFrame(playheadIntervalRef.current);
    };
  }, [isPlaying, currentTime, project.timeline]);

  // --- Timeline Interactions ---
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    setIsDraggingPlayhead(true);
    updatePlayheadPosition(e);
  };

  const updatePlayheadPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!timelineContentRef.current) return;
    const rect = timelineContentRef.current.getBoundingClientRect();
    const x = e.clientX - (rect.left + HEADER_WIDTH) + timelineContentRef.current.scrollLeft;
    const newTime = Math.max(0, x / PIXELS_PER_SECOND);
    setCurrentTime(newTime);
  };

  const handleResizeStart = (e: React.MouseEvent, item: TimelineItem, side: 'start' | 'end') => {
    e.stopPropagation();
    setResizingItem({
      itemId: item.id,
      side,
      initialX: e.clientX,
      initialStart: item.startTime,
      initialDuration: item.duration
    });
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPlayhead) updatePlayheadPosition(e);
      if (resizingItem) {
        const deltaX = (e.clientX - resizingItem.initialX) / PIXELS_PER_SECOND;
        setProject(prev => ({
          ...prev,
          timeline: prev.timeline.map(track => ({
            ...track,
            items: track.items.map(i => {
              if (i.id !== resizingItem.itemId) return i;
              if (resizingItem.side === 'start') {
                const newStart = Math.max(0, resizingItem.initialStart + deltaX);
                const newDur = Math.max(0.1, resizingItem.initialDuration - (newStart - resizingItem.initialStart));
                return { ...i, startTime: newStart, duration: newDur };
              } else {
                const newDur = Math.max(0.1, resizingItem.initialDuration + deltaX);
                return { ...i, duration: newDur };
              }
            })
          }))
        }));
      }
    };
    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      setResizingItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, resizingItem]);

  /**
   * Robust helper to extract accurate duration from media files.
   */
  const getMediaDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('audio')) {
        const audio = new Audio();
        audio.onloadedmetadata = () => {
          resolve(audio.duration);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          console.error("Audio duration error:", file.name);
          resolve(5); // Fallback
          URL.revokeObjectURL(url);
        };
        audio.src = url;
      } else if (file.type.startsWith('video')) {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          resolve(video.duration);
          URL.revokeObjectURL(url);
        };
        video.onerror = () => {
          console.error("Video duration error:", file.name);
          resolve(5); // Fallback
          URL.revokeObjectURL(url);
        };
        video.src = url;
      } else {
        resolve(5); // Default duration for images (seconds)
      }
    });
  };

  const processFiles = async (files: FileList) => {
    setIsUploading(true);
    try {
      const newAssetsPromises = Array.from(files).map(async (file: File) => {
        const duration = await getMediaDuration(file);
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type.startsWith('image') ? 'image' : file.type.startsWith('audio') ? 'audio' : 'video',
          url: URL.createObjectURL(file),
          thumbnail: file.type.startsWith('image') ? URL.createObjectURL(file) : undefined,
          duration: duration
        } as Asset;
      });

      const newAssets = await Promise.all(newAssetsPromises);
      setProject(prev => ({ ...prev, assets: [...prev.assets, ...newAssets] }));
    } catch (err) {
      console.error("Upload process failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  const addToTimeline = (asset: Asset, targetTrackId?: string, startTime: number = currentTime) => {
    const resolvedTrackId = targetTrackId || project.timeline.find(t => 
      (asset.type === 'audio' && t.type === 'audio') || 
      (asset.type !== 'audio' && t.type === 'video')
    )?.id || 'v1';

    const newItemId = Math.random().toString(36).substr(2, 9);
    const newTimelineItem: TimelineItem = {
      id: newItemId,
      assetId: asset.id,
      startTime: startTime,
      duration: asset.duration || (asset.type === 'image' ? 5 : 10),
      layer: 0
    };

    setProject(prev => ({
      ...prev,
      timeline: prev.timeline.map(track => 
        track.id === resolvedTrackId ? { ...track, items: [...track.items, newTimelineItem] } : track
      )
    }));
    setSelectedItemId(newItemId);
  };

  const handleSplit = () => {
    if (!selectedItemId) return;
    setProject(prev => {
      const newTimeline = [...prev.timeline];
      for (const track of newTimeline) {
        const itemIdx = track.items.findIndex(i => i.id === selectedItemId);
        if (itemIdx !== -1) {
          const item = track.items[itemIdx];
          if (currentTime > item.startTime && currentTime < item.startTime + item.duration) {
            const firstPartDuration = currentTime - item.startTime;
            const secondPartDuration = item.duration - firstPartDuration;
            
            const firstPart = { ...item, duration: firstPartDuration };
            const secondPart = { ...item, id: Math.random().toString(36).substr(2, 9), startTime: currentTime, duration: secondPartDuration };
            
            track.items.splice(itemIdx, 1, firstPart, secondPart);
            setSelectedItemId(secondPart.id);
            break;
          }
        }
      }
      return { ...prev, timeline: newTimeline };
    });
  };

  const handleDelete = () => {
    if (!selectedItemId) return;
    setProject(prev => ({
      ...prev,
      timeline: prev.timeline.map(t => ({
        ...t,
        items: t.items.filter(i => i.id !== selectedItemId)
      }))
    }));
    setSelectedItemId(null);
  };

  const handleTrackDrop = (e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('type');
    const rect = timelineContentRef.current!.getBoundingClientRect();
    const x = e.clientX - (rect.left + HEADER_WIDTH) + timelineContentRef.current!.scrollLeft;
    const dropStartTime = Math.max(0, x / PIXELS_PER_SECOND);

    if (type === 'timeline-item' && draggingItem) {
      setProject(prev => {
        const sourceTrack = prev.timeline.find(t => t.id === draggingItem.trackId);
        const item = sourceTrack?.items.find(i => i.id === draggingItem.itemId);
        if (!item) return prev;
        const targetTrack = prev.timeline.find(t => t.id === targetTrackId);
        if (sourceTrack?.type !== targetTrack?.type) return prev;
        return {
          ...prev,
          timeline: prev.timeline.map(t => {
            if (t.id === draggingItem.trackId && t.id === targetTrackId) return { ...t, items: t.items.map(i => i.id === item.id ? { ...i, startTime: dropStartTime } : i) };
            if (t.id === draggingItem.trackId) return { ...t, items: t.items.filter(i => i.id !== item.id) };
            if (t.id === targetTrackId) return { ...t, items: [...t.items, { ...item, startTime: dropStartTime }] };
            return t;
          })
        };
      });
    } else if (type === 'library-asset' && draggingAssetId) {
      const asset = project.assets.find(a => a.id === draggingAssetId);
      if (asset) addToTimeline(asset, targetTrackId, dropStartTime);
    }
    setDraggingItem(null);
    setDraggingAssetId(null);
  };

  const handleAiAction = async () => {
    if (!aiInput.trim()) return;
    const prompt = aiInput;
    setAiInput('');
    setMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setIsAiLoading(true);
    try {
      if (aiMode === AIServiceMode.CHAT) {
        const response = await geminiService.askAssistant(prompt, `Project: ${project.title}, Assets: ${project.assets.length}`);
        setMessages(prev => [...prev, { role: 'ai', text: response || "" }]);
      } else if (aiMode === AIServiceMode.VIDEO_GEN) {
        const url = await geminiService.generateVideo(prompt);
        const asset = { id: Math.random().toString(36).substr(2, 9), name: 'AI Clip', type: 'video' as const, url };
        setProject(prev => ({ ...prev, assets: [asset, ...prev.assets] }));
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Request failed." }]);
    } finally { setIsAiLoading(false); }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800/50 flex items-center justify-between px-6 glass shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-lg flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            Lumina <span className="text-violet-500">Studio</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
           {isBuffering && isPlaying && (
             <div className="flex items-center gap-2 text-[10px] text-amber-500 font-bold bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                <Loader2 size={12} className="animate-spin"/> BUFFERING
             </div>
           )}
           <button className="px-4 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-all shadow-lg flex items-center gap-2">
             <Download size={14} /> <span>Export</span>
           </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* Left Library */}
        <div className="hidden md:flex w-80 border-r border-zinc-800/50 flex-col glass z-20 shrink-0">
          <div className="flex border-b border-zinc-800/50">
            {['media', 'search'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === tab ? 'text-violet-500 border-b-2 border-violet-500 bg-violet-500/5' : 'text-zinc-500'}`}>{tab}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {activeTab === 'media' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase">Library</h3>
                  <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors" disabled={isUploading}>
                    {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14} />}
                  </button>
                  <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => e.target.files && processFiles(e.target.files)} />
                </div>
                {isUploading && (
                   <div className="p-3 bg-violet-600/10 border border-violet-500/20 rounded-lg flex items-center gap-3">
                      <Loader2 size={14} className="animate-spin text-violet-500"/>
                      <span className="text-[10px] font-bold text-violet-400">Processing media...</span>
                   </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {project.assets.map(asset => (
                    <div key={asset.id} draggable onDragStart={(e) => {setDraggingAssetId(asset.id); e.dataTransfer.setData('type', 'library-asset');}} onClick={() => addToTimeline(asset)} className="group relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-violet-500 transition-all cursor-grab active:cursor-grabbing">
                      <div className="w-full h-full flex items-center justify-center">
                        {asset.type === 'audio' ? <Music className="text-zinc-600" size={20} /> : asset.type === 'image' ? <ImageIcon className="text-zinc-600" size={20} /> : <Video className="text-zinc-600" size={20} />}
                        {asset.thumbnail && <img src={asset.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-40" />}
                        {asset.duration && (
                          <div className="absolute top-1 right-1 px-1 bg-black/60 rounded flex items-center gap-1 text-[7px] text-zinc-300">
                             <Clock size={8}/> {asset.duration >= 60 ? `${Math.floor(asset.duration/60)}:${Math.floor(asset.duration%60).toString().padStart(2,'0')}` : `${asset.duration.toFixed(1)}s`}
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1 bg-black/60 text-[8px] truncate">{asset.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 flex flex-col min-w-0 bg-black relative">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative group/canvas">
               <div className="flex-1 flex items-center justify-center relative">
                  {/* Buffering Overlay */}
                  {isBuffering && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-50">
                       <Loader2 size={32} className="animate-spin text-violet-500"/>
                       <span className="text-xs font-bold tracking-widest text-violet-400">BUFFERING</span>
                    </div>
                  )}
                  <Play size={48} className="opacity-5" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity">
                     <button onClick={() => setIsPlaying(!isPlaying)} className="w-16 h-16 bg-white/10 backdrop-blur rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
                        {isPlaying ? <Pause size={32} fill="white"/> : <Play size={32} fill="white" className="ml-1"/>}
                     </button>
                  </div>
               </div>
               <div className="h-12 border-t border-zinc-800/50 flex items-center justify-between px-6 bg-zinc-950/90 backdrop-blur">
                  <div className="text-[10px] font-mono text-zinc-500">{(Math.floor(currentTime/60)).toString().padStart(2,'0')}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}:{(Math.floor((currentTime%1)*100)).toString().padStart(2,'0')}</div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} className="hover:text-white transition-colors"><SkipBack size={18} /></button>
                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-9 h-9 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                      {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
                    </button>
                    <button onClick={() => setCurrentTime(currentTime + 5)} className="hover:text-white transition-colors"><SkipForward size={18} /></button>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
                    <Zap size={10} className="text-amber-500"/> REALTIME
                  </div>
               </div>
            </div>
          </div>

          {/* AI Panel */}
          <div className={`absolute top-4 right-4 bottom-4 w-96 flex flex-col transition-all duration-300 z-40 ${isAiOpen ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+24px)] opacity-0 pointer-events-none'}`}>
            <div className="flex-1 glass rounded-2xl border border-zinc-800/50 flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/50">
                <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">AI Copilot</span>
                <button onClick={() => setIsAiOpen(false)}><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-2">
                      <Sparkles size={32}/>
                      <p className="text-xs font-bold uppercase tracking-widest">Ask for editing help</p>
                   </div>
                )}
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-lg ${m.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-violet-600/20 border border-violet-500/30 text-zinc-100'}`}>{m.text}</div>
                  </div>
                ))}
                {isAiLoading && <Loader2 size={16} className="animate-spin text-violet-500" />}
              </div>
              <div className="p-3 border-t border-zinc-800/50 bg-zinc-950/50">
                <div className="relative">
                  <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAiAction()} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 pr-10 text-xs focus:ring-1 focus:ring-violet-500 outline-none resize-none h-16 shadow-inner" placeholder="E.g. 'Shorten the voiceover track'..." />
                  <button onClick={handleAiAction} className="absolute bottom-2 right-2 p-1.5 bg-violet-600 hover:bg-violet-500 rounded-md transition-colors"><Send size={12} /></button>
                </div>
              </div>
            </div>
          </div>
          {!isAiOpen && (
            <button onClick={() => setIsAiOpen(true)} className="absolute top-4 right-4 w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center shadow-xl z-40 transition-transform hover:scale-110"><ChevronLeft size={20} /></button>
          )}
        </div>
      </div>

      {/* Timeline Section */}
      <div className="h-80 border-t border-zinc-800/50 glass flex flex-col z-10 select-none overflow-hidden">
        {/* Toolbox */}
        <div className="h-10 border-b border-zinc-800/50 flex items-center px-4 bg-zinc-900/50 gap-4 shrink-0">
           <div className="flex items-center gap-1 border-r border-zinc-800 pr-4">
              <button onClick={handleSplit} disabled={!selectedItemId} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase"><Scissors size={14} /> Split</button>
              <button onClick={handleDelete} disabled={!selectedItemId} className="p-1.5 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded disabled:opacity-30 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase"><Trash2 size={14} /> Delete</button>
           </div>
           <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 flex items-center gap-2">
              <Layers size={14}/> Timeline Editor
           </div>
        </div>

        {/* Ruler */}
        <div className="h-8 border-b border-zinc-800/50 flex items-center bg-zinc-900/40 relative shrink-0">
           <div className="w-40 border-r border-zinc-800 h-full flex items-center px-4 bg-zinc-950/20 sticky left-0 z-30">
             <span className="text-[10px] font-bold opacity-30 uppercase tracking-tighter">Timeline</span>
           </div>
           <div className="flex-1 h-full overflow-hidden relative" ref={rulerScrollRef} onMouseDown={handleTimelineMouseDown}>
              <div className="h-full relative flex items-center" style={{ width: '15000px' }}>
                {[...Array(300)].map((_, i) => (
                  <div key={i} className="text-[8px] text-zinc-600 border-l border-zinc-800/50 h-full pt-2 pl-1 shrink-0" style={{ width: `${PIXELS_PER_SECOND * 5}px` }}>{Math.floor(i*5/60)}:{(i*5%60).toString().padStart(2,'0')}</div>
                ))}
                <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-50 pointer-events-none" style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}>
                  <div className="w-3 h-3 bg-red-500 rounded-b-sm -ml-[5px]" />
                </div>
              </div>
           </div>
        </div>

        {/* Tracks Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-auto" ref={timelineContentRef}>
          <div className="relative min-h-full" style={{ width: '15000px' }}>
            {project.timeline.map(track => (
              <div key={track.id} className={`h-16 border-b border-zinc-800/30 flex group ${draggingAssetId ? 'bg-white/5' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => handleTrackDrop(e, track.id)}>
                <div className="w-40 border-r border-zinc-800 flex flex-col justify-center px-4 bg-zinc-950/60 sticky left-0 z-20 group-hover:bg-zinc-900 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase truncate pr-2">{track.name}</span>
                    <div className="flex items-center gap-1">
                       {track.volume === 0 ? <VolumeX size={10} className="text-zinc-600"/> : <Volume2 size={10} className="text-zinc-500"/>}
                    </div>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={e => setProject(p=>({...p, timeline:p.timeline.map(t=>t.id===track.id?{...t,volume:parseFloat(e.target.value)}:t)}))} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                </div>
                <div className="flex-1 relative bg-zinc-900/5">
                  {track.items.map(item => {
                    const asset = project.assets.find(a => a.id === item.assetId);
                    const isSelected = selectedItemId === item.id;
                    return (
                      <div key={item.id} onClick={(e) => {e.stopPropagation(); setSelectedItemId(item.id);}} draggable onDragStart={e => {setDraggingItem({itemId:item.id, trackId:track.id}); e.dataTransfer.setData('type', 'timeline-item');}} style={{ left: `${item.startTime * PIXELS_PER_SECOND}px`, width: `${item.duration * PIXELS_PER_SECOND}px` }} className={`absolute top-2 bottom-2 rounded border shadow-xl flex flex-col justify-center px-2 overflow-hidden transition-all group/item cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-violet-500 border-violet-400 z-40 bg-opacity-40' : 'border-zinc-700'} ${track.type === 'audio' ? 'bg-indigo-600/20' : 'bg-violet-600/20'}`}>
                        {asset?.type === 'audio' && <AudioWaveform url={asset.url} color="#818cf8" />}
                        
                        {/* Resize Handles */}
                        <div onMouseDown={(e) => handleResizeStart(e, item, 'start')} className="resize-handle absolute left-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-violet-500 cursor-ew-resize opacity-0 group-hover/item:opacity-100 z-50 transition-all" />
                        <div onMouseDown={(e) => handleResizeStart(e, item, 'end')} className="resize-handle absolute right-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-violet-500 cursor-ew-resize opacity-0 group-hover/item:opacity-100 z-50 transition-all" />

                        <div className="relative z-10 flex items-center justify-between gap-1 pointer-events-none">
                           <div className="flex items-center gap-1 truncate">
                              {asset?.type === 'audio' ? <Music size={10} className="text-indigo-400" /> : asset?.type === 'image' ? <ImageIcon size={10} className="text-zinc-400" /> : <Video size={10} className="text-violet-400" />}
                              <span className="text-[9px] font-bold truncate text-zinc-100">{asset?.name}</span>
                           </div>
                           <GripHorizontal size={10} className="text-zinc-600 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                        </div>
                        {/* Internal Progress Bar */}
                        {isPlaying && currentTime >= item.startTime && currentTime <= item.startTime + item.duration && (
                          <div className="absolute bottom-0 left-0 h-0.5 bg-white/40 shadow-[0_0_8px_white]" style={{ width: `${((currentTime - item.startTime) / item.duration) * 100}%` }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-[2px] bg-red-500/30 pointer-events-none z-10" style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
