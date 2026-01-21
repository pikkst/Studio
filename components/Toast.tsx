import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-600/10',
      borderColor: 'border-green-500/20',
      iconColor: 'text-green-400',
      textColor: 'text-green-100',
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-600/10',
      borderColor: 'border-red-500/20',
      iconColor: 'text-red-400',
      textColor: 'text-red-100',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-amber-600/10',
      borderColor: 'border-amber-500/20',
      iconColor: 'text-amber-400',
      textColor: 'text-amber-100',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-600/10',
      borderColor: 'border-blue-500/20',
      iconColor: 'text-blue-400',
      textColor: 'text-blue-100',
    },
  };

  const { icon: Icon, bgColor, borderColor, iconColor, textColor } = config[type];

  return (
    <div
      className={`fixed top-6 right-6 z-50 max-w-md ${bgColor} ${borderColor} border rounded-lg shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300`}
    >
      <Icon size={20} className={iconColor} />
      <span className={`text-sm font-semibold flex-1 ${textColor}`}>
        {message}
      </span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X size={16} className="text-zinc-400" />
      </button>
    </div>
  );
};
