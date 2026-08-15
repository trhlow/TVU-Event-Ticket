import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic overlay+panel primitive — the shared chrome behind ConfirmModal and any other
 * one-off dialog (e.g. read-only detail views) so they don't each reimplement backdrop/close.
 */
export default function Dialog({ isOpen, onClose, title, children, footer, maxWidth = "max-w-md" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`).current;
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Callers routinely pass an inline onClose (e.g. `() => setOpen(false)`), a fresh function
  // reference on every render of the caller. Keeping it out of the effect's dependency array (and
  // reading it through a ref instead) stops that from re-running the effect below on every
  // keystroke a caller's own state change causes -- which was re-focusing the panel and yanking
  // focus out of whatever input inside the dialog the user was typing into.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 animate-fade-in bg-slate-950/45" onClick={onClose} aria-label="Đóng" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn("relative z-10 w-full animate-fade-in rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xl shadow-slate-950/10 focus:outline-none", maxWidth)}
      >
        <button
          onClick={onClose}
          className="btn-press absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          aria-label="Đóng hộp thoại"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h3 id={titleId} className="font-display pr-8 text-base font-semibold text-slate-950">{title}</h3>}
        <div className={title ? "mt-3" : undefined}>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">{footer}</div>}
      </div>
    </div>
  );
}
