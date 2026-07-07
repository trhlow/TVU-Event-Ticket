import React from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info" | "success";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  message,
  confirmText = "Xác nhận",
  cancelText = "Hủy bỏ",
  type = "warning",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const positive = type === "success";
  const dangerous = type === "danger";
  const Icon = positive ? CheckCircle : AlertTriangle;
  const iconClass = positive
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : dangerous
      ? "bg-rose-50 text-rose-700 border-rose-100"
      : "bg-amber-50 text-amber-700 border-amber-100";
  const buttonClass = positive
    ? "bg-emerald-600 hover:bg-emerald-700"
    : dangerous
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-brand-600 hover:bg-brand-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-sm" onClick={onCancel} aria-label="Đóng" />
      <div className="relative z-10 w-full max-w-md animate-fade-in rounded-3xl border border-white/80 bg-white p-6 text-left shadow-2xl shadow-slate-950/20">
        <button
          onClick={onCancel}
          className="btn-press absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
          aria-label="Đóng hộp thoại"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="pr-8">
            <h3 className="font-display text-lg font-extrabold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description || message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn-press min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn-press min-h-10 rounded-xl px-4 text-sm font-bold text-white shadow-sm ${buttonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
