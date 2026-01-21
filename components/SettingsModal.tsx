import React, { useState } from 'react';
import { X, Key, Save, Check, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiKey: string;
  onSaveApiKey: (key: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentApiKey,
  onSaveApiKey,
}) => {
  const [apiKey, setApiKey] = useState(currentApiKey);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(apiKey);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onClose();
    }, 1500);
  };

  const maskedKey = currentApiKey 
    ? `${currentApiKey.slice(0, 8)}...${currentApiKey.slice(-4)}`
    : 'Not set';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center">
              <Key size={20} className="text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Settings</h2>
              <p className="text-xs text-zinc-500">Configure your AI settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Alert */}
          <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-lg flex gap-3">
            <AlertCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200">
              <p className="font-semibold mb-1">Your API Key, Your Control</p>
              <p className="text-blue-300/80">
                Enter your own Google Gemini API key to use AI features. Your key is stored locally and never shared.
              </p>
            </div>
          </div>

          {/* Current Key Status */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Current Key
            </label>
            <div className="px-4 py-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-sm text-zinc-500">
              {maskedKey}
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Google Gemini API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-zinc-600">
              Get your free API key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Success Message */}
          {showSuccess && (
            <div className="p-4 bg-green-600/10 border border-green-500/20 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2 duration-200">
              <Check size={20} className="text-green-400" />
              <span className="text-sm font-semibold text-green-300">
                API key saved successfully!
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-800/50 bg-zinc-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2"
          >
            <Save size={16} />
            Save API Key
          </button>
        </div>
      </div>
    </div>
  );
};
