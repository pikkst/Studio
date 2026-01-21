import React, { useState } from 'react';
import { Sparkles, Wand2, FileText, Scissors, MessageSquare, Loader2 } from 'lucide-react';

interface SmartAIPanelProps {
  onAction: (action: string, params?: any) => void;
  isLoading: boolean;
  projectContext: {
    totalDuration: number;
    videoCount: number;
    audioCount: number;
    textCount: number;
  };
}

export const SmartAIPanel: React.FC<SmartAIPanelProps> = ({ onAction, isLoading, projectContext }) => {
  const [customPrompt, setCustomPrompt] = useState('');

  const smartActions = [
    {
      id: 'auto-subtitle',
      icon: FileText,
      label: 'Auto Subtitles',
      description: 'Generate subtitles from audio',
      color: 'violet',
      action: () => onAction('AUTO_SUBTITLE')
    },
    {
      id: 'scene-analysis',
      icon: Sparkles,
      label: 'Analyze Scenes',
      description: 'Get editing suggestions',
      color: 'blue',
      action: () => onAction('SCENE_ANALYSIS')
    },
    {
      id: 'smart-cuts',
      icon: Scissors,
      label: 'Smart Cuts',
      description: 'Auto-detect cut points',
      color: 'amber',
      action: () => onAction('SMART_EDIT')
    },
    {
      id: 'narration',
      icon: MessageSquare,
      label: 'Generate Narration',
      description: 'Create voiceover script',
      color: 'green',
      action: () => {
        const script = prompt('Enter narration script:');
        if (script) onAction('NARRATION', { text: script });
      }
    }
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Project Overview */}
      <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-400 uppercase mb-2">Project Overview</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Duration:</span>
            <span className="text-zinc-300 font-semibold">{projectContext.totalDuration.toFixed(1)}s</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Video:</span>
            <span className="text-zinc-300 font-semibold">{projectContext.videoCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Audio:</span>
            <span className="text-zinc-300 font-semibold">{projectContext.audioCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Text:</span>
            <span className="text-zinc-300 font-semibold">{projectContext.textCount}</span>
          </div>
        </div>
      </div>

      {/* AI Status */}
      <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-green-400">
          <Sparkles size={12} className="animate-pulse" />
          <span className="font-semibold">AI sees your entire timeline</span>
        </div>
      </div>

      {/* Smart Actions Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-zinc-400 uppercase">Smart Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          {smartActions.map((action) => {
            const Icon = action.icon;
            const colorClasses = {
              violet: 'bg-violet-600/10 border-violet-500/20 hover:bg-violet-600/20 text-violet-400',
              blue: 'bg-blue-600/10 border-blue-500/20 hover:bg-blue-600/20 text-blue-400',
              amber: 'bg-amber-600/10 border-amber-500/20 hover:bg-amber-600/20 text-amber-400',
              green: 'bg-green-600/10 border-green-500/20 hover:bg-green-600/20 text-green-400'
            }[action.color];

            return (
              <button
                key={action.id}
                onClick={action.action}
                disabled={isLoading}
                className={`p-3 ${colorClasses} border rounded-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group`}
              >
                <div className="flex items-start gap-2">
                  <Icon size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{action.label}</div>
                    <div className="text-[10px] opacity-70 truncate">{action.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom AI Prompt */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-zinc-400 uppercase">Custom Request</h3>
        <div className="relative">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Describe what you want AI to do with your project..."
            className="w-full h-20 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            disabled={isLoading}
          />
          <button
            onClick={() => {
              if (customPrompt.trim()) {
                onAction('CUSTOM', { prompt: customPrompt });
                setCustomPrompt('');
              }
            }}
            disabled={isLoading || !customPrompt.trim()}
            className="absolute bottom-2 right-2 p-1.5 bg-violet-600 hover:bg-violet-500 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          </button>
        </div>
      </div>

      {/* AI Tips */}
      <div className="p-3 bg-blue-600/5 border border-blue-500/10 rounded-lg">
        <div className="flex items-start gap-2">
          <Sparkles size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-blue-300/80 leading-relaxed">
            <strong>Pro Tip:</strong> AI sees your entire timeline! Ask for specific edits like "add fade transitions between all clips" or "create 5-second intro text".
          </div>
        </div>
      </div>
    </div>
  );
};
