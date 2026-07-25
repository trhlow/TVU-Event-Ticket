import React from "react";
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

/**
 * Generic overlay+panel primitive — the shared chrome behind ConfirmModal and any other
 * one-off dialog (e.g. read-only detail views) so they don't each reimplement backdrop/close.
 */
export default function Dialog({ isOpen, onClose, title, children, footer, maxWidth = "max-w-md" }: DialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 animate-fade-in bg-slate-950/45" onClick={onClose} aria-label="Đóng" />
      <div className={cn("relative z-10 w-full animate-fade-in rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xl shadow-slate-950/10", maxWidth)}>
        <button
          onClick={onClose}
          className="btn-press absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          aria-label="Đóng hộp thoại"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h3 className="font-display pr-8 text-base font-semibold text-slate-950">{title}</h3>}
        <div className={title ? "mt-3" : undefined}>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">{footer}</div>}
      </div>
    </div>
  );
}
