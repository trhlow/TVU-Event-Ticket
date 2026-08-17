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
    ? "bg-success-50 text-success-700 border-success-100"
    : dangerous
      ? "bg-danger-50 text-danger-700 border-danger-100"
      : "bg-warning-50 text-warning-700 border-warning-100";
  const buttonClass = positive
    ? "bg-success-600 hover:bg-success-700"
    : dangerous
      ? "bg-danger-600 hover:bg-danger-700"
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
            className="btn-press h-10 rounded-control border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn-press h-10 rounded-control px-4 text-sm font-medium text-white shadow-sm ${buttonClass}`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-control border ${iconClass}`}>
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
