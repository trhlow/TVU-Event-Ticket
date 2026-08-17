import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DetailDrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function DetailDrawer({
  isOpen,
  title,
  onClose,
  children,
}: DetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    // Whatever had focus when the drawer opened gets it back on close; otherwise focus falls to
    // the top of the document and a keyboard user has to tab from the beginning again.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep Tab inside the panel. Without this the focus ring walks off into the page behind
      // the backdrop, where it is both invisible and unreachable by pointer.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // The page behind a modal must not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-xs" onClick={onClose}></div>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white h-full w-full max-w-lg relative z-10 p-6 shadow-2xl border-l border-slate-200 flex flex-col focus:outline-none"
      >
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
          <h3 id={titleId} className="text-base font-bold text-slate-950 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}
