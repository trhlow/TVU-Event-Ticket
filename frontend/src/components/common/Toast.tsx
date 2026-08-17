import React, { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  // Callers pass onClose inline (e.g. `onClose={() => dismiss(toast.id)}`), a fresh reference every
  // render. Keeping it out of the timer effect's deps (read through a ref instead) stops an unrelated
  // re-render -- e.g. a second toast being queued -- from restarting the auto-dismiss countdown.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-success-50 border-success-200 text-success-800',
          icon: <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0" />,
        };
      case 'error':
        return {
          bg: 'bg-danger-50 border-danger-200 text-danger-800',
          icon: <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0" />,
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
    <div role="status" aria-live="polite" className={`toast-enter fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-card border px-4 py-3 shadow-lg max-w-sm ${style.bg}`}>
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
