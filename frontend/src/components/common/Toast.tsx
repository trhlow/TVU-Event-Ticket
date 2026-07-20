import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          icon: <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />,
        };
      case 'error':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800',
          icon: <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-brand-50 border-brand-200 text-brand-800',
          icon: <Info className="w-5 h-5 text-brand-600 flex-shrink-0" />,
        };
    }
  };

  const style = getStyle();

  return (
    <div role="status" aria-live="polite" className={`toast-enter fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg max-w-sm ${style.bg}`}>
      {style.icon}
      <span className="text-xs font-bold leading-tight">{message}</span>
      <button 
        onClick={onClose}
        className="p-1 rounded-full hover:bg-black/5 text-gray-500 cursor-pointer ml-2"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
