import { AlertTriangle, CheckCircle } from "lucide-react";
import Dialog from "./Dialog";

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
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="btn-press h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn-press h-10 rounded-xl px-4 text-sm font-medium text-white shadow-sm ${buttonClass}`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description || message}</p>
        </div>
      </div>
    </Dialog>
  );
}
