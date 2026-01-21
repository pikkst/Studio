import React from 'react';
import { X, Sliders } from 'lucide-react';
import { Asset, TimelineItem, TransitionType } from '../types';

interface PropertiesPanelProps {
  selectedItem: TimelineItem | null;
  asset: Asset | null;
  onUpdateItem: (updates: Partial<TimelineItem>) => void;
  onClose: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedItem,
  asset,
  onUpdateItem,
  onClose
}) => {
  if (!selectedItem || !asset) return null;

  const transitions: TransitionType[] = ['none', 'fade', 'dissolve', 'wipe', 'slide'];

  return (
    <div className="w-80 border-l border-zinc-800/50 glass flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-violet-500" />
          <span className="text-[10px] font-bold text-zinc-300 tracking-widest uppercase">Properties</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {/* Asset Info */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase">Asset</h3>
          <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div className="text-sm font-semibold text-zinc-200 truncate">{asset.name}</div>
            <div className="text-xs text-zinc-500 mt-1">{asset.type}</div>
          </div>
        </div>

        {/* Timing */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase">Timing</h3>
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Start Time (s)</label>
            <input
              type="number"
              value={selectedItem.startTime.toFixed(2)}
              onChange={(e) => onUpdateItem({ startTime: parseFloat(e.target.value) || 0 })}
              step="0.1"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Duration (s)</label>
            <input
              type="number"
              value={selectedItem.duration.toFixed(2)}
              onChange={(e) => onUpdateItem({ duration: parseFloat(e.target.value) || 0.1 })}
              step="0.1"
              min="0.1"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Transitions */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase">Transitions</h3>
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Transition In</label>
            <select
              value={selectedItem.transitionIn || 'none'}
              onChange={(e) => onUpdateItem({ transitionIn: e.target.value as TransitionType })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
            >
              {transitions.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Transition Out</label>
            <select
              value={selectedItem.transitionOut || 'none'}
              onChange={(e) => onUpdateItem({ transitionOut: e.target.value as TransitionType })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
            >
              {transitions.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Transition Duration (s)</label>
            <input
              type="number"
              value={(selectedItem.transitionDuration || 0.5).toFixed(1)}
              onChange={(e) => onUpdateItem({ transitionDuration: parseFloat(e.target.value) || 0.5 })}
              step="0.1"
              min="0.1"
              max="2"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Opacity */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase">Opacity</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-500">Opacity</label>
              <span className="text-xs text-zinc-400">{((selectedItem.opacity ?? 1) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={selectedItem.opacity ?? 1}
              onChange={(e) => onUpdateItem({ opacity: parseFloat(e.target.value) })}
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
            />
          </div>
        </div>

        {/* Filters */}
        {(asset.type === 'video' || asset.type === 'image') && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase">Filters</h3>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Brightness</label>
                <span className="text-xs text-zinc-400">{((selectedItem.filters?.brightness ?? 1) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={selectedItem.filters?.brightness ?? 1}
                onChange={(e) => onUpdateItem({ 
                  filters: { ...selectedItem.filters, brightness: parseFloat(e.target.value) }
                })}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Contrast</label>
                <span className="text-xs text-zinc-400">{((selectedItem.filters?.contrast ?? 1) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={selectedItem.filters?.contrast ?? 1}
                onChange={(e) => onUpdateItem({ 
                  filters: { ...selectedItem.filters, contrast: parseFloat(e.target.value) }
                })}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Saturation</label>
                <span className="text-xs text-zinc-400">{((selectedItem.filters?.saturation ?? 1) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={selectedItem.filters?.saturation ?? 1}
                onChange={(e) => onUpdateItem({ 
                  filters: { ...selectedItem.filters, saturation: parseFloat(e.target.value) }
                })}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Blur</label>
                <span className="text-xs text-zinc-400">{(selectedItem.filters?.blur ?? 0).toFixed(1)}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={selectedItem.filters?.blur ?? 0}
                onChange={(e) => onUpdateItem({ 
                  filters: { ...selectedItem.filters, blur: parseFloat(e.target.value) }
                })}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>
          </div>
        )}

        {/* Volume for audio items */}
        {asset.type === 'audio' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase">Audio</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Volume</label>
                <span className="text-xs text-zinc-400">{((selectedItem.volume ?? 1) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selectedItem.volume ?? 1}
                onChange={(e) => onUpdateItem({ volume: parseFloat(e.target.value) })}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>
          </div>
        )}

        {/* Reset Button */}
        <button
          onClick={() => onUpdateItem({
            opacity: 1,
            transitionIn: 'none',
            transitionOut: 'none',
            transitionDuration: 0.5,
            filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0 },
            volume: 1
          })}
          className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};
