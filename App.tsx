import React, { useState, useRef, useEffect } from 'react';
import { Plus, Play, Pause, SkipForward, SkipBack, Video, Image as ImageIcon, Music, Layers, Zap, Trash2, Sparkles, X, Send, Loader2, ExternalLink, ChevronLeft, Volume2, VolumeX, GripHorizontal, Scissors, Clock, Save, FolderOpen, LogOut, Settings, Download, Type, Undo2, Redo2, Copy, Clipboard, Gauge, Grid3x3, Magnet } from 'lucide-react';
import { Asset, ProjectState, AIServiceMode, TimelineItem } from './types';
import { geminiService } from './services/geminiService';
import { supabaseService } from './services/supabaseService';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { AuthScreen } from './components/AuthScreen';
import { AudioWaveform } from './components/AudioWaveform';
import { SettingsModal } from './components/SettingsModal';
import { Toast } from './components/Toast';
import { VideoCanvas } from './components/VideoCanvas';
import { VideoExporter } from './components/VideoExporter';
import { PropertiesPanel } from './components/PropertiesPanel';
import { SmartAIPanel } from './components/SmartAIPanel';

const App: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [project, setProject] = useState<ProjectState>({
    id: Math.random().toString(36).substr(2, 9),
    title: 'New Project',
    assets: [],
    timeline: [
      { id: 'v1', name: 'Video 1', type: 'video', volume: 1, items: [] },
      { id: 'v2', name: 'Video 2', type: 'video', volume: 1, items: [] },
      { id: 't1', name: 'Text/Subtitles', type: 'text', volume: 1, items: [] },
      { id: 'a1', name: 'Background', type: 'audio', volume: 0.5, items: [] },
      { id: 'a2', name: 'Voiceover', type: 'audio', volume: 1, items: [] }
    ]
  });

  const [activeTab, setActiveTab] = useState<'media' | 'search'>('media');
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [draggingItem, setDraggingItem] = useState<{itemId: string, trackId: string} | null>(null);
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [resizingItem, setResizingItem] = useState<{itemId: string, side: 'start' | 'end', initialX: number, initialStart: number, initialDuration: number} | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copiedItem, setCopiedItem] = useState<TimelineItem | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userGeminiKey, setUserGeminiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'warning' | 'info'} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, { source: AudioBufferSourceNode | null, gainNode: GainNode, buffer: AudioBuffer, startedAt: number }>>(new Map());
  const playheadIntervalRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const PIXELS_PER_SECOND = 30 * timelineZoom;
  const HEADER_WIDTH = 160;

  useEffect(() => {
    const initAuth = async () => {
      const currentUser = await supabaseService.getCurrentUser();
      setUser(currentUser);
      
      // Auto-load last project and assets when user is logged in
      if (currentUser) {
        try {
          const projects = await supabaseService.loadProjects(currentUser.id);
          if (projects.length > 0) {
            setProject(projects[0].data);
            setToast({ message: `Loaded: ${projects[0].data.title}`, type: 'success' });
          }
          
          const assets = await supabaseService.loadAssets(currentUser.id);
          if (assets.length > 0) {
            const mappedAssets: Asset[] = assets.map(a => ({
              id: a.id,
              name: a.name,
              type: a.type as 'video' | 'audio' | 'image' | 'text',
              url: a.url,
              thumbnail: a.thumbnail_url,
              duration: a.duration
            }));
            setProject(prev => ({ ...prev, assets: mappedAssets }));
          }
        } catch (error) {
          console.error('Auto-load failed:', error);
        }
      }
      
      setAuthLoading(false);
    };
    initAuth();
    const { data: { subscription } } = supabaseService.onAuthStateChange((user) => setUser(user));
    return () => subscription.unsubscribe();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space - play/pause (when not in input)
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
      
      // Delete - delete selected item
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        handleDelete();
      }
      
      // Ctrl+Z - undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      
      // Ctrl+Shift+Z or Ctrl+Y - redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
      
      // Ctrl+C - copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedItemId && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        handleCopy();
      }
      
      // Ctrl+V - paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        handlePaste();
      }
      
      // Ctrl+D - duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedItemId && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        handleDuplicate();
      }
      
      // Ctrl+S - save project
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
      
      // Ctrl+E - export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setIsExportOpen(true);
      }
      
      // S - split at playhead
      if (e.key === 's' && selectedItemId && !(e.target as HTMLElement).matches('input, textarea') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSplit();
      }
      
      // Arrow keys - nudge playhead
      if (e.key === 'ArrowLeft' && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        setCurrentTime(prev => Math.max(0, prev - (e.shiftKey ? 1 : 0.1)));
      }
      if (e.key === 'ArrowRight' && !(e.target as HTMLElement).matches('input, textarea')) {
        e.preventDefault();
        setCurrentTime(prev => prev + (e.shiftKey ? 1 : 0.1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, isPlaying]);

  const handleSignOut = async () => {
    await supabaseService.signOut();
    setUser(null);
  };

  const handleSaveProject = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      await supabaseService.saveProject(project, user.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartAIAction = async (action: string, params?: any) => {
    setIsAiLoading(true);
    try {
      const timelineData = {
        title: project.title,
        duration: Math.max(...project.timeline.flatMap(track => track.items.map(item => item.startTime + item.duration)), 0),
        tracks: project.timeline.map(track => ({
          name: track.name,
          type: track.type,
          items: track.items.map(item => {
            const asset = project.assets.find(a => a.id === item.assetId);
            return {
              startTime: item.startTime,
              duration: item.duration,
              assetName: asset?.name,
              assetType: asset?.type,
              textContent: asset?.textContent,
            };
          })
        }))
      };

      switch (action) {
        case 'AUTO_SUBTITLE': {
          setMessages(m => [...m, { role: 'user', text: 'Generate auto-subtitles...' }]);
          const audioTracks = project.timeline.filter(t => t.type === 'audio' && t.items.length > 0);
          if (audioTracks.length === 0) {
            setMessages(m => [...m, { role: 'ai', text: '⚠️ No audio tracks found. Add audio first to generate subtitles.' }]);
            break;
          }
          
          // Mock subtitle generation - in real app would use speech-to-text API
          const subtitles = [
            { text: 'Welcome to the video', start: 0, duration: 3 },
            { text: 'This is an example subtitle', start: 3.5, duration: 3 },
            { text: 'More content coming soon', start: 7, duration: 3 }
          ];
          
          // Add subtitles to text track
          const textTrack = project.timeline.find(t => t.type === 'text');
          if (textTrack) {
            const newSubtitles = subtitles.map(sub => {
              const asset: Asset = {
                id: Math.random().toString(36).substr(2, 9),
                name: 'Subtitle',
                type: 'text',
                url: '',
                textContent: sub.text,
                textStyle: { fontSize: 24, fontFamily: 'Arial', color: '#FFFFFF', align: 'center', bold: false, italic: false }
              };
              setProject(prev => ({ ...prev, assets: [...prev.assets, asset] }));
              
              return {
                id: Math.random().toString(36).substr(2, 9),
                assetId: asset.id,
                startTime: sub.start,
                duration: sub.duration,
                layer: 0
              } as TimelineItem;
            });
            
            setProject(prev => ({
              ...prev,
              timeline: prev.timeline.map(track => 
                track.id === textTrack.id 
                  ? { ...track, items: [...track.items, ...newSubtitles] }
                  : track
              )
            }));
          }
          
          setMessages(m => [...m, { role: 'ai', text: `📝 Generated ${subtitles.length} subtitles and added to timeline!\n\n💡 In production: Would use speech-to-text API for real transcription.` }]);
          break;
        }

        case 'SCENE_ANALYSIS': {
          setMessages(m => [...m, { role: 'user', text: 'Analyze scenes and suggest improvements...' }]);
          const analysis = await geminiService.analyzeTimeline(timelineData);
          setMessages(m => [...m, { role: 'ai', text: `🎬 Scene Analysis:\n\n${analysis}` }]);
          break;
        }

        case 'SMART_EDIT': {
          setMessages(m => [...m, { role: 'user', text: 'Find smart cut points...' }]);
          const cuts = await geminiService.suggestCutPoints(timelineData);
          if (cuts.length === 0) {
            setMessages(m => [...m, { role: 'ai', text: '✂️ No obvious cut points found. Your timeline pacing looks good!' }]);
          } else {
            const cutText = cuts.map((c: any, i: number) => `${i+1}. ${c.time.toFixed(1)}s - ${c.reason} (${c.action})`).join('\n');
            
            // Ask if user wants to apply cuts automatically
            const shouldApply = confirm(`Found ${cuts.length} cut suggestions.\n\n${cutText}\n\nApply these cuts automatically?`);
            
            if (shouldApply) {
              // Apply cuts by splitting items at suggested times
              setProject(prev => {
                const newTimeline = [...prev.timeline];
                cuts.forEach((cut: any) => {
                  newTimeline.forEach(track => {
                    track.items.forEach((item, idx) => {
                      if (cut.time > item.startTime && cut.time < item.startTime + item.duration) {
                        // Split this item
                        const firstPart = { ...item, duration: cut.time - item.startTime };
                        const secondPart = {
                          ...item,
                          id: Math.random().toString(36).substr(2, 9),
                          startTime: cut.time,
                          duration: item.startTime + item.duration - cut.time
                        };
                        track.items.splice(idx, 1, firstPart, secondPart);
                      }
                    });
                  });
                });
                return { ...prev, timeline: newTimeline };
              });
              setMessages(m => [...m, { role: 'ai', text: `✂️ Applied ${cuts.length} smart cuts to timeline!\n\n${cutText}` }]);
            } else {
              setMessages(m => [...m, { role: 'ai', text: `✂️ Smart Cut Suggestions:\n\n${cutText}\n\n💡 Click timeline at these points to manually split clips.` }]);
            }
          }
          break;
        }

        case 'NARRATION': {
          const style = params?.style || 'professional';
          setMessages(m => [...m, { role: 'user', text: `Generate ${style} narration and audio...` }]);
          
          const script = await geminiService.generateNarrationScript(timelineData, style);
          setMessages(m => [...m, { role: 'ai', text: `🎙️ Script generated! Creating audio...` }]);
          
          // Generate audio from script using TTS
          if (userGeminiKey) {
            try {
              const audioUrl = await geminiService.generateNarration(script, userGeminiKey);
              if (audioUrl) {
                const asset: Asset = {
                  id: Math.random().toString(36).substr(2, 9),
                  name: 'AI Narration',
                  type: 'audio',
                  url: audioUrl,
                  duration: 10 // Estimate, would be calculated from actual audio
                };
                setProject(prev => ({ ...prev, assets: [asset, ...prev.assets] }));
                
                // Add to voiceover track
                const voiceTrack = project.timeline.find(t => t.name === 'Voiceover');
                if (voiceTrack) {
                  const newItem: TimelineItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    assetId: asset.id,
                    startTime: 0,
                    duration: asset.duration || 10,
                    layer: 0
                  };
                  setProject(prev => ({
                    ...prev,
                    timeline: prev.timeline.map(track =>
                      track.id === voiceTrack.id
                        ? { ...track, items: [...track.items, newItem] }
                        : track
                    )
                  }));
                }
                
                setMessages(m => [...m, { role: 'ai', text: `✅ Narration created and added to timeline!\n\n📝 Script:\n${script.substring(0, 200)}...` }]);
              }
            } catch (err) {
              setMessages(m => [...m, { role: 'ai', text: `❌ TTS failed. Here's the script:\n\n${script}` }]);
            }
          } else {
            setMessages(m => [...m, { role: 'ai', text: `🎙️ Script:\n\n${script}\n\n⚠️ Set Gemini API key to generate audio.` }]);
          }
          break;
        }

        case 'AUTO_TRANSITIONS': {
          setMessages(m => [...m, { role: 'user', text: 'Suggest transitions...' }]);
          const suggestions = await geminiService.suggestTransitions(timelineData, userGeminiKey);
          
          if (suggestions.length === 0) {
            setMessages(m => [...m, { role: 'ai', text: '⚡ No transition suggestions. Your cuts look smooth already!' }]);
            break;
          }
          
          const transText = suggestions.map((s: any, i: number) => 
            `${i+1}. ${s.transitionType} - ${s.reason}`
          ).join('\n');
          
          const shouldApply = confirm(`Found ${suggestions.length} transition suggestions.\n\n${transText}\n\nApply automatically?`);
          
          if (shouldApply) {
            setProject(prev => ({
              ...prev,
              timeline: prev.timeline.map(track => ({
                ...track,
                items: track.items.map(item => {
                  const suggestion = suggestions.find((s: any) => s.itemId === item.id);
                  if (suggestion) {
                    return {
                      ...item,
                      transitionIn: suggestion.transitionType,
                      transitionInDuration: 0.5
                    };
                  }
                  return item;
                })
              }))
            }));
            setMessages(m => [...m, { role: 'ai', text: `⚡ Applied ${suggestions.length} transitions!\n\n${transText}` }]);
          } else {
            setMessages(m => [...m, { role: 'ai', text: `⚡ Transition Suggestions:\n\n${transText}` }]);
          }
          break;
        }

        case 'CUSTOM': {
          if (!params?.prompt) break;
          setMessages(m => [...m, { role: 'user', text: params.prompt }]);
          const suggestions = await geminiService.getSmartSuggestions({
            title: project.title,
            videoCount: project.assets.filter(a => a.type === 'video').length,
            audioCount: project.assets.filter(a => a.type === 'audio').length,
            textCount: project.assets.filter(a => a.type === 'text').length,
            totalDuration: timelineData.duration,
          });
          setMessages(m => [...m, { role: 'ai', text: suggestions }]);
          break;
        }
      }
    } catch (error: any) {
      setMessages(m => [...m, { role: 'ai', text: `❌ Error: ${error.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => handleSaveProject(), 30000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [project, user]);

  const handleLoadProjects = async () => {
    if (!user) return;
    try {
      const projects = await supabaseService.loadProjects(user.id);
      if (projects.length > 0) setProject(projects[0].data);
    } catch (error) {
      console.error('Load failed:', error);
    }
  };

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

  useEffect(() => {
    // Initialize Web Audio Context
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioItems = project.timeline.flatMap(t => t.items).filter(item => {
      const asset = project.assets.find(a => a.id === item.assetId);
      return asset?.type === 'audio';
    });
    const itemIds = new Set(audioItems.map(i => i.id));
    
    // Remove old audio nodes
    for (const id of audioNodesRef.current.keys()) {
      if (!itemIds.has(id)) {
        const node = audioNodesRef.current.get(id);
        if (node?.source) {
          node.source.stop();
          node.source.disconnect();
          node.gainNode.disconnect();
        }
        audioNodesRef.current.delete(id);
      }
    }
    
    // Load new audio buffers
    audioItems.forEach(async (item) => {
      if (!audioNodesRef.current.has(item.id)) {
        const asset = project.assets.find(a => a.id === item.assetId);
        if (asset && audioContextRef.current) {
          try {
            const response = await fetch(asset.url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            
            const gainNode = audioContextRef.current.createGain();
            gainNode.connect(audioContextRef.current.destination);
            gainNode.gain.value = 0;
            
            audioNodesRef.current.set(item.id, {
              source: null,
              gainNode,
              buffer: audioBuffer,
              startedAt: 0
            });
            
            console.log('Audio buffer loaded:', asset.name);
          } catch (error) {
            console.error('Failed to load audio:', asset.name, error);
          }
        }
      }
    });
  }, [project.timeline, project.assets]);

  useEffect(() => {
    const syncAudio = () => {
      if (!audioContextRef.current) return;
      
      audioNodesRef.current.forEach((node, itemId) => {
        let item: TimelineItem | undefined;
        let parentTrack;
        for (const track of project.timeline) {
          item = track.items.find(i => i.id === itemId);
          if (item) {
            parentTrack = track;
            break;
          }
        }
        if (!item || !parentTrack) return;
        
        const isInside = currentTime >= item.startTime && currentTime < (item.startTime + item.duration);
        const itemTime = currentTime - item.startTime;
        
        // Calculate target volume with fade-in/fade-out
        let targetVolume = 0;
        if (isInside) {
          const fadeDuration = 0.05;
          const baseVolume = parentTrack.volume * (item.volume !== undefined ? item.volume : 1);
          
          if (itemTime < fadeDuration) {
            targetVolume = baseVolume * (itemTime / fadeDuration);
          } else if (itemTime > item.duration - fadeDuration) {
            const fadeProgress = (item.duration - itemTime) / fadeDuration;
            targetVolume = baseVolume * fadeProgress;
          } else {
            targetVolume = baseVolume;
          }
        }
        
        // Smooth volume transitions with Web Audio API
        const currentGain = node.gainNode.gain.value;
        if (Math.abs(currentGain - targetVolume) > 0.01) {
          node.gainNode.gain.setValueAtTime(currentGain + (targetVolume - currentGain) * 0.3, audioContextRef.current.currentTime);
        } else {
          node.gainNode.gain.setValueAtTime(targetVolume, audioContextRef.current.currentTime);
        }
        
        if (isPlaying && isInside) {
          // Start audio source if not playing
          if (!node.source) {
            const source = audioContextRef.current.createBufferSource();
            source.buffer = node.buffer;
            source.connect(node.gainNode);
            source.start(0, itemTime);
            node.source = source;
            node.startedAt = audioContextRef.current.currentTime - itemTime;
          }
        } else {
          // Stop audio source when out of range
          if (node.source) {
            try {
              node.source.stop();
              node.source.disconnect();
            } catch (e) {
              // Already stopped
            }
            node.source = null;
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
      syncAudio();
    }
    return () => { if (playheadIntervalRef.current) cancelAnimationFrame(playheadIntervalRef.current); };
  }, [isPlaying, currentTime, project.timeline]);

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
    setResizingItem({ itemId: item.id, side, initialX: e.clientX, initialStart: item.startTime, initialDuration: item.duration });
  }

  useEffect(() => {
    let animationFrameId: number | null = null;
    let currentMouseX = 0;
    
    const handleMouseMove = (e: MouseEvent) => {
      currentMouseX = e.clientX;
      
      if (isDraggingPlayhead) {
        updatePlayheadPosition(e);
      }
      
      if (resizingItem && !animationFrameId) {
        animationFrameId = requestAnimationFrame(() => {
          const deltaX = (currentMouseX - resizingItem.initialX) / PIXELS_PER_SECOND;
          
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
          
          animationFrameId = null;
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      setResizingItem(null);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isDraggingPlayhead, resizingItem, PIXELS_PER_SECOND]);

  const processFiles = async (files: FileList) => {
    if (!user) return;
    setIsUploading(true);
    try {
      // Ensure project exists in Supabase before uploading assets
      await supabaseService.saveProject(project, user.id);
      
      const uploadPromises = Array.from(files).map(async (file: File) => {
        const storedAsset = await supabaseService.uploadMedia(file, user.id, project.id);
        return {
          id: storedAsset.id,
          name: storedAsset.name,
          type: storedAsset.type as 'video' | 'audio' | 'image',
          url: storedAsset.url,
          thumbnail: storedAsset.thumbnail_url,
          duration: storedAsset.duration || undefined
        } as Asset;
      });
      const newAssets = await Promise.all(uploadPromises);
      setProject(prev => ({ ...prev, assets: [...prev.assets, ...newAssets] }));
    } catch (err) {
      console.error("Upload failed", err);
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const addTextToTimeline = () => {
    const text = prompt('Enter text:');
    if (!text) return;

    const textAsset: Asset = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Text: ' + text.slice(0, 20),
      type: 'text',
      url: '',
      duration: 5,
      textContent: text,
      textStyle: {
        fontFamily: 'Inter',
        fontSize: 48,
        color: '#ffffff',
        align: 'center',
        bold: false,
        italic: false
      }
    };

    setProject(prev => ({ ...prev, assets: [textAsset, ...prev.assets] }));
    addToTimeline(textAsset);
  };

  const addToTimeline = (asset: Asset, targetTrackId?: string, startTime: number = currentTime) => {
    const resolvedTrackId = targetTrackId || project.timeline.find(t => 
      (asset.type === 'audio' && t.type === 'audio') || 
      (asset.type === 'text' && t.type === 'text') ||
      (asset.type !== 'audio' && asset.type !== 'text' && t.type === 'video')
    )?.id || 'v1';
    const newItemId = Math.random().toString(36).substr(2, 9);
    const newTimelineItem: TimelineItem = {
      id: newItemId,
      assetId: asset.id,
      startTime: startTime,
      duration: asset.duration || (asset.type === 'image' || asset.type === 'text' ? 5 : 10),
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

  const handleUpdateItem = (updates: Partial<TimelineItem>) => {
    if (!selectedItemId) return;
    saveToHistory();
    setProject(prev => ({
      ...prev,
      timeline: prev.timeline.map(track => ({
        ...track,
        items: track.items.map(item =>
          item.id === selectedItemId ? { ...item, ...updates } : item
        )
      }))
    }));
  };

  const saveToHistory = () => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, JSON.parse(JSON.stringify(project))];
    });
    setHistoryIndex(prev => prev + 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setProject(JSON.parse(JSON.stringify(history[historyIndex - 1])));
      setToast({ message: 'Undo', type: 'success' });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setProject(JSON.parse(JSON.stringify(history[historyIndex + 1])));
      setToast({ message: 'Redo', type: 'success' });
    }
  };

  const handleCopy = () => {
    if (!selectedItemId) return;
    const item = project.timeline.flatMap(t => t.items).find(i => i.id === selectedItemId);
    if (item) {
      setCopiedItem(JSON.parse(JSON.stringify(item)));
      setToast({ message: 'Copied', type: 'success' });
    }
  };

  const handlePaste = () => {
    if (!copiedItem) return;
    saveToHistory();
    const newItem = {
      ...copiedItem,
      id: Math.random().toString(36).substr(2, 9),
      startTime: currentTime
    };
    
    // Find appropriate track
    const asset = project.assets.find(a => a.id === copiedItem.assetId);
    const trackId = project.timeline.find(t => 
      (asset?.type === 'audio' && t.type === 'audio') || 
      (asset?.type === 'text' && t.type === 'text') ||
      (asset?.type !== 'audio' && asset?.type !== 'text' && t.type === 'video')
    )?.id || 'v1';
    
    setProject(prev => ({
      ...prev,
      timeline: prev.timeline.map(track =>
        track.id === trackId ? { ...track, items: [...track.items, newItem] } : track
      )
    }));
    setSelectedItemId(newItem.id);
    setToast({ message: 'Pasted', type: 'success' });
  };

  const handleDuplicate = () => {
    if (!selectedItemId) return;
    const item = project.timeline.flatMap(t => t.items).find(i => i.id === selectedItemId);
    if (!item) return;
    
    saveToHistory();
    const newItem = {
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      startTime: item.startTime + item.duration
    };
    
    setProject(prev => ({
      ...prev,
      timeline: prev.timeline.map(track => ({
        ...track,
        items: track.items.find(i => i.id === item.id) 
          ? [...track.items, newItem]
          : track.items
      }))
    }));
    setSelectedItemId(newItem.id);
    setToast({ message: 'Duplicated', type: 'success' });
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
      timeline: prev.timeline.map(t => ({ ...t, items: t.items.filter(i => i.id !== selectedItemId) }))
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
    
    // Check if user has API key
    if (!userGeminiKey) {
      setToast({ message: 'Please set your Gemini API key in Settings first', type: 'warning' });
      setIsSettingsOpen(true);
      return;
    }

    const prompt = aiInput;
    setAiInput('');
    setMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setIsAiLoading(true);
    try {
      if (aiMode === AIServiceMode.CHAT) {
        const response = await geminiService.askAssistant(prompt, `Project: ${project.title}, Assets: ${project.assets.length}`, userGeminiKey);
        setMessages(prev => [...prev, { role: 'ai', text: response || "" }]);
      } else if (aiMode === AIServiceMode.IMAGE_GEN) {
        setMessages(prev => [...prev, { role: 'ai', text: "Generating image..." }]);
        const url = await geminiService.generateImage(prompt, userGeminiKey);
        const asset: Asset = { id: Math.random().toString(36).substr(2, 9), name: 'AI Generated Image', type: 'image', url, thumbnail: url, duration: 5 };
        setProject(prev => ({ ...prev, assets: [asset, ...prev.assets] }));
        setMessages(prev => [...prev, { role: 'ai', text: "Image generated! Added to your library." }]);
      } else if (aiMode === AIServiceMode.SPEECH_GEN) {
        setMessages(prev => [...prev, { role: 'ai', text: "Generating speech..." }]);
        const url = await geminiService.generateNarration(prompt, userGeminiKey);
        if (url) {
          const asset: Asset = { id: Math.random().toString(36).substr(2, 9), name: 'AI Narration', type: 'audio', url, duration: 5 };
          setProject(prev => ({ ...prev, assets: [asset, ...prev.assets] }));
          setMessages(prev => [...prev, { role: 'ai', text: "Speech generated! Check audio in library." }]);
        }
      } else if (aiMode === AIServiceMode.SEARCH) {
        const result = await geminiService.searchMediaReferences(prompt, userGeminiKey);
        setMessages(prev => [...prev, { role: 'ai', text: result.text, links: result.links }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${(e as Error).message}` }]);
      setToast({ message: `AI Error: ${(e as Error).message}`, type: 'error' });
    } finally { 
      setIsAiLoading(false); 
    }
  };

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setUserGeminiKey(key);
    setToast({ message: 'API key saved successfully!', type: 'success' });
  };

  // Get selected item and asset
  const selectedItem = selectedItemId 
    ? project.timeline.flatMap(t => t.items).find(i => i.id === selectedItemId) || null
    : null;
  const selectedAsset = selectedItem 
    ? project.assets.find(a => a.id === selectedItem.assetId) || null
    : null;

  if (authLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="animate-spin text-violet-500" size={48} /></div>;
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-200">
      <header className="h-14 border-b border-zinc-800/50 flex items-center justify-between px-6 glass shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-lg flex items-center justify-center"><Sparkles size={18} className="text-white" /></div>
          <h1 className="font-display font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">Lumina <span className="text-violet-500">Studio</span></h1>
          <input type="text" value={project.title} onChange={(e) => setProject(prev => ({ ...prev, title: e.target.value }))} className="ml-4 bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-violet-500 outline-none px-2 py-1 text-sm" />
        </div>
        <div className="flex items-center gap-4">
          {saveStatus === 'saving' && <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 size={12} className="animate-spin"/> Saving...</div>}
          {saveStatus === 'saved' && <div className="flex items-center gap-2 text-xs text-green-400">Saved ✓</div>}
          <button onClick={() => setIsExportOpen(true)} className="px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-all flex items-center gap-2"><Download size={14} /> Export</button>
          <button onClick={() => setIsSettingsOpen(true)} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-all flex items-center gap-2"><Settings size={14} /> Settings</button>
          <button onClick={handleSaveProject} disabled={isSaving} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-all flex items-center gap-2"><Save size={14} /> Save</button>
          <button onClick={handleLoadProjects} className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-all flex items-center gap-2"><FolderOpen size={14} /> Load</button>
          <button onClick={handleSignOut} className="px-3 py-1.5 text-xs font-semibold bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-md transition-all flex items-center gap-2"><LogOut size={14} /> Sign Out</button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
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
                  <div className="flex items-center gap-2">
                    <button onClick={addTextToTimeline} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors" title="Add Text">
                      <Type size={14} />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors" disabled={isUploading}>
                      {isUploading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14} />}
                    </button>
                  </div>
                  <input type="file" ref={fileInputRef} multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => e.target.files && processFiles(e.target.files)} />
                </div>
                {isUploading && <div className="p-3 bg-violet-600/10 border border-violet-500/20 rounded-lg flex items-center gap-3"><Loader2 size={14} className="animate-spin text-violet-500"/><span className="text-[10px] font-bold text-violet-400">Uploading to cloud...</span></div>}
                {project.assets.length === 0 && !isUploading && <div className="text-center py-8 text-zinc-600 text-xs">No assets yet. Upload files to start.</div>}
                <div className="grid grid-cols-2 gap-2">
                  {project.assets.map(asset => (
                    <div key={asset.id} draggable onDragStart={(e) => {setDraggingAssetId(asset.id); e.dataTransfer.setData('type', 'library-asset');}} onClick={() => addToTimeline(asset)} className="group relative aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-violet-500 transition-all cursor-grab active:cursor-grabbing">
                      <div className="w-full h-full flex items-center justify-center">
                        {asset.type === 'audio' ? <Music className="text-zinc-600" size={20} /> : asset.type === 'image' ? <ImageIcon className="text-zinc-600" size={20} /> : asset.type === 'text' ? <Type className="text-zinc-600" size={20} /> : <Video className="text-zinc-600" size={20} />}
                        {asset.thumbnail && <img src={asset.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-40" alt={asset.name} />}
                        {asset.textContent && <div className="absolute inset-0 flex items-center justify-center p-2 text-[10px] font-bold text-zinc-300 text-center line-clamp-3">{asset.textContent}</div>}
                        {asset.duration && <div className="absolute top-1 right-1 px-1 bg-black/60 rounded flex items-center gap-1 text-[7px] text-zinc-300"><Clock size={8}/> {asset.duration >= 60 ? `${Math.floor(asset.duration/60)}:${Math.floor(asset.duration%60).toString().padStart(2,'0')}` : `${asset.duration.toFixed(1)}s`}</div>}
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1 bg-black/60 text-[8px] truncate">{asset.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-black relative">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col relative group/canvas">
              <div className="flex-1 flex items-center justify-center relative bg-black">
                {isBuffering && isPlaying && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-50"><Loader2 size={32} className="animate-spin text-violet-500"/><span className="text-xs font-bold tracking-widest text-violet-400">BUFFERING</span></div>}
                <VideoCanvas currentTime={currentTime} timeline={project.timeline} assets={project.assets} isPlaying={isPlaying} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/canvas:opacity-100 transition-opacity pointer-events-none">
                  <div className="pointer-events-auto">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-16 h-16 bg-white/10 backdrop-blur rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all">{isPlaying ? <Pause size={32} fill="white"/> : <Play size={32} fill="white" className="ml-1"/>}</button>
                  </div>
                </div>
              </div>
              <div className="h-12 border-t border-zinc-800/50 flex items-center justify-between px-6 bg-zinc-950/90 backdrop-blur">
                <div className="text-[10px] font-mono text-zinc-500">{(Math.floor(currentTime/60)).toString().padStart(2,'0')}:{(Math.floor(currentTime%60)).toString().padStart(2,'0')}:{(Math.floor((currentTime%1)*100)).toString().padStart(2,'0')}</div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentTime(Math.max(0, currentTime - 5))} className="hover:text-white transition-colors"><SkipBack size={18} /></button>
                  <button onClick={() => setIsPlaying(!isPlaying)} className="w-9 h-9 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">{isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}</button>
                  <button onClick={() => setCurrentTime(currentTime + 5)} className="hover:text-white transition-colors"><SkipForward size={18} /></button>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-bold uppercase tracking-tighter"><Zap size={10} className="text-amber-500"/> REALTIME</div>
              </div>
            </div>
          </div>

          <div className={`absolute top-4 right-4 bottom-4 w-96 flex flex-col transition-all duration-300 z-40 ${isAiOpen ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+24px)] opacity-0 pointer-events-none'}`}>
            <div className="flex-1 glass rounded-2xl border border-zinc-800/50 flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/50">
                <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">AI Copilot</span>
                <div className="flex items-center gap-2">
                  <select value={aiMode} onChange={(e) => setAiMode(e.target.value as AIServiceMode)} className="text-[9px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 outline-none">
                    <option value={AIServiceMode.CHAT}>Chat</option>
                    <option value={AIServiceMode.IMAGE_GEN}>Image Gen</option>
                    <option value={AIServiceMode.SPEECH_GEN}>Speech Gen</option>
                    <option value={AIServiceMode.SEARCH}>Search</option>
                  </select>
                  <button onClick={() => setIsAiOpen(false)}><X size={14} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <SmartAIPanel
                  onAction={handleSmartAIAction}
                  isLoading={isAiLoading}
                  projectContext={{
                    totalDuration: Math.max(...project.timeline.flatMap(track => track.items.map(item => item.startTime + item.duration)), 0),
                    videoCount: project.assets.filter(a => a.type === 'video').length,
                    audioCount: project.assets.filter(a => a.type === 'audio').length,
                    textCount: project.assets.filter(a => a.type === 'text').length,
                  }}
                />
                {messages.length > 0 && <div className="space-y-4 border-t border-zinc-800 pt-4 mt-4">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-lg ${m.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-violet-600/20 border border-violet-500/30 text-zinc-100'}`}>
                        {m.text}
                        {m.links && m.links.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {m.links.map((link, i) => (
                              <a key={i} href={link.uri} target="_blank" rel="noopener noreferrer" className="block text-violet-300 hover:text-violet-200 text-[10px] flex items-center gap-1"><ExternalLink size={10} /> {link.title}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isAiLoading && <div className="flex justify-start"><div className="bg-violet-600/20 border border-violet-500/30 rounded-xl px-3 py-2"><Loader2 size={16} className="animate-spin text-violet-500" /></div></div>}
                </div>}
              </div>
              <div className="p-3 border-t border-zinc-800/50 bg-zinc-950/50">
                <div className="relative">
                  <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAiAction())} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 pr-10 text-xs focus:ring-1 focus:ring-violet-500 outline-none resize-none h-16 shadow-inner" placeholder={aiMode === AIServiceMode.IMAGE_GEN ? "Describe image..." : aiMode === AIServiceMode.SPEECH_GEN ? "Text to speak..." : aiMode === AIServiceMode.SEARCH ? "Search for media..." : "Ask AI..."} />
                  <button onClick={handleAiAction} disabled={isAiLoading} className="absolute bottom-2 right-2 p-1.5 bg-violet-600 hover:bg-violet-500 rounded-md transition-colors disabled:opacity-50"><Send size={12} /></button>
                </div>
              </div>
            </div>
          </div>
          {!isAiOpen && <button onClick={() => setIsAiOpen(true)} className="absolute top-4 right-4 w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center shadow-xl z-40 transition-transform hover:scale-110"><ChevronLeft size={20} /></button>}
        </div>
      </div>

      <div className="h-80 border-t border-zinc-800/50 glass flex z-10 select-none overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-10 border-b border-zinc-800/50 flex items-center px-4 bg-zinc-900/50 gap-2 shrink-0 overflow-x-auto">
            {/* Edit Tools */}
            <div className="flex items-center gap-1 border-r border-zinc-800 pr-2">
              <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors" title="Undo (Ctrl+Z)">
                <Undo2 size={14} />
              </button>
              <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors" title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={14} />
              </button>
            </div>
            
            {/* Clipboard */}
            <div className="flex items-center gap-1 border-r border-zinc-800 pr-2">
              <button onClick={handleCopy} disabled={!selectedItemId} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors" title="Copy (Ctrl+C)">
                <Copy size={14} />
              </button>
              <button onClick={handlePaste} disabled={!copiedItem} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors" title="Paste (Ctrl+V)">
                <Clipboard size={14} />
              </button>
              <button onClick={handleDuplicate} disabled={!selectedItemId} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors text-[10px] font-bold uppercase" title="Duplicate (Ctrl+D)">
                <Copy size={14} className="mr-1" /> D
              </button>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-1 border-r border-zinc-800 pr-2">
              <button onClick={handleSplit} disabled={!selectedItemId} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-30 transition-colors flex items-center gap-1" title="Split (S)">
                <Scissors size={14} />
              </button>
              <button onClick={handleDelete} disabled={!selectedItemId} className="p-1.5 hover:bg-red-900/40 text-red-400 hover:text-red-300 rounded disabled:opacity-30 transition-colors" title="Delete (Del)">
                <Trash2 size={14} />
              </button>
            </div>
            
            {/* Settings */}
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-2">
              <button onClick={() => setSnapToGrid(!snapToGrid)} className={`p-1.5 rounded transition-colors ${snapToGrid ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-zinc-800'}`} title="Snap to Grid">
                <Magnet size={14} />
              </button>
            </div>
            
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 flex items-center gap-2"><Layers size={14}/> Timeline</div>
            
            {/* Zoom */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[9px] text-zinc-500">Zoom:</span>
              <button onClick={() => setTimelineZoom(prev => Math.max(0.5, prev - 0.25))} className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">−</button>
              <span className="text-[9px] text-zinc-400 font-mono w-12 text-center">{(timelineZoom * 100).toFixed(0)}%</span>
              <button onClick={() => setTimelineZoom(prev => Math.min(3, prev + 0.25))} className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors">+</button>
            </div>
            
            {selectedItem && <div className="text-[10px] text-violet-400 font-semibold border-l border-zinc-800 pl-2">Selected</div>}
          </div>

        <div className="h-8 border-b border-zinc-800/50 flex items-center bg-zinc-900/40 relative shrink-0">
          <div className="w-40 border-r border-zinc-800 h-full flex items-center px-4 bg-zinc-950/20 sticky left-0 z-30"><span className="text-[10px] font-bold opacity-30 uppercase tracking-tighter">Timeline</span></div>
          <div className="flex-1 h-full overflow-hidden relative" ref={rulerScrollRef} onMouseDown={handleTimelineMouseDown}>
            <div className="h-full relative flex items-center" style={{ width: '15000px' }}>
              {[...Array(300)].map((_, i) => (
                <div key={i} className="text-[8px] text-zinc-600 border-l border-zinc-800/50 h-full pt-2 pl-1 shrink-0" style={{ width: `${PIXELS_PER_SECOND * 5}px` }}>{Math.floor(i*5/60)}:{(i*5%60).toString().padStart(2,'0')}</div>
              ))}
              <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-50 pointer-events-none" style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}><div className="w-3 h-3 bg-red-500 rounded-b-sm -ml-[5px]" /></div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-auto" ref={timelineContentRef}>
          <div className="relative min-h-full" style={{ width: '15000px' }}>
            {project.timeline.map(track => (
              <div key={track.id} className={`h-16 border-b border-zinc-800/30 flex group ${draggingAssetId ? 'bg-white/5' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => handleTrackDrop(e, track.id)}>
                <div className="w-40 border-r border-zinc-800 flex flex-col justify-center px-4 bg-zinc-950/60 sticky left-0 z-20 group-hover:bg-zinc-900 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase truncate pr-2">{track.name}</span>
                    <div className="flex items-center gap-1">{track.volume === 0 ? <VolumeX size={10} className="text-zinc-600"/> : <Volume2 size={10} className="text-zinc-500"/>}</div>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={track.volume} onChange={e => setProject(p=>({...p, timeline:p.timeline.map(t=>t.id===track.id?{...t,volume:parseFloat(e.target.value)}:t)}))} className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                </div>
                <div className="flex-1 relative bg-zinc-900/5">
                  {track.items.map(item => {
                    const asset = project.assets.find(a => a.id === item.assetId);
                    const isSelected = selectedItemId === item.id;
                    const isResizing = resizingItem?.itemId === item.id;
                    return (
                      <div key={item.id} onClick={(e) => {e.stopPropagation(); setSelectedItemId(item.id);}} draggable onDragStart={e => {setDraggingItem({itemId:item.id, trackId:track.id}); e.dataTransfer.setData('type', 'timeline-item');}} style={{ left: `${item.startTime * PIXELS_PER_SECOND}px`, width: `${item.duration * PIXELS_PER_SECOND}px` }} className={`absolute top-2 bottom-2 rounded border shadow-xl flex flex-col justify-center px-2 overflow-hidden transition-none group/item ${isResizing ? 'cursor-ew-resize' : 'cursor-grab active:cursor-grabbing'} ${isSelected ? 'ring-2 ring-violet-500 border-violet-400 z-40 bg-opacity-40' : 'border-zinc-700'} ${isResizing ? 'ring-2 ring-blue-500' : ''} ${track.type === 'audio' ? 'bg-indigo-600/20' : track.type === 'text' ? 'bg-amber-600/20' : 'bg-violet-600/20'}`}>
                        {asset?.type === 'audio' && <AudioWaveform url={asset.url} color="#818cf8" />}
                        <div onMouseDown={(e) => handleResizeStart(e, item, 'start')} className="resize-handle absolute left-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-violet-500 cursor-ew-resize opacity-0 group-hover/item:opacity-100 z-50 transition-all" />
                        <div onMouseDown={(e) => handleResizeStart(e, item, 'end')} className="resize-handle absolute right-0 top-0 bottom-0 w-1.5 bg-white/20 hover:bg-violet-500 cursor-ew-resize opacity-0 group-hover/item:opacity-100 z-50 transition-all" />
                        <div className="relative z-10 flex items-center justify-between gap-1 pointer-events-none">
                          <div className="flex items-center gap-1 truncate">
                            {asset?.type === 'audio' ? <Music size={10} className="text-indigo-400" /> : asset?.type === 'image' ? <ImageIcon size={10} className="text-zinc-400" /> : asset?.type === 'text' ? <Type size={10} className="text-amber-400" /> : <Video size={10} className="text-violet-400" />}
                            <span className="text-[9px] font-bold truncate text-zinc-100">{asset?.name}</span>
                          </div>
                          <GripHorizontal size={10} className="text-zinc-600 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                        </div>
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

        {/* Properties Panel */}
        {selectedItem && selectedAsset && (
          <PropertiesPanel
            selectedItem={selectedItem}
            asset={selectedAsset}
            onUpdateItem={handleUpdateItem}
            onClose={() => setSelectedItemId(null)}
          />
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentApiKey={userGeminiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* Video Exporter */}
      <VideoExporter
        project={project}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default App;
