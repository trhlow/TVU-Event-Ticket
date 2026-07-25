import React, { useState } from "react";
import { Bookmark, CreditCard, Save, ShieldAlert, User } from "lucide-react";
import { Input } from "../ui/input";

export interface StudentProfileFormValues {
  mssv: string;
  className: string;
}

interface StudentProfileFormProps {
  fullName: string;
  initialValues: StudentProfileFormValues;
  onSubmit: (values: StudentProfileFormValues) => Promise<void> | void;
  submitLabel: string;
  isSubmitting?: boolean;
  secondaryAction?: React.ReactNode;
  /** Extra content (e.g. an info note) rendered between the fields and the action row. */
  beforeActions?: React.ReactNode;
  /** Optional caption rendered under the read-only full-name field. */
  fullNameHint?: string;
}

/**
 * Shared MSSV/class-code fields + required-field validation used by both
 * CompleteProfilePage and StudentProfilePage. Each page keeps its own chrome
 * (title, description, submit handler / navigation-after-submit) and just
 * renders this form for the actual fields.
 */
export default function StudentProfileForm({
  fullName,
  initialValues,
  onSubmit,
  submitLabel,
  isSubmitting = false,
  secondaryAction,
  beforeActions,
  fullNameHint,
}: StudentProfileFormProps) {
  const [mssv, setMssv] = useState(initialValues.mssv);
  const [className, setClassName] = useState(initialValues.className);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg("");
    if (!mssv.trim()) {
      setErrorMsg("Vui lòng nhập MSSV.");
      return;
    }
    if (!className.trim()) {
      setErrorMsg("Vui lòng nhập lớp học.");
      return;
    }

    try {
      await onSubmit({ mssv: mssv.trim(), className: className.trim().toUpperCase() });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errorMsg && (
        <div className="flex gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3.5 text-[11px] font-bold text-danger-700">
          <ShieldAlert className="h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Họ và tên</label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={fullName} disabled className="bg-slate-100 pl-10 text-slate-500" />
        </div>
        {fullNameHint && <p className="text-[10px] font-semibold text-slate-400">{fullNameHint}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Mã số sinh viên (MSSV) *</label>
          <div className="relative">
            <CreditCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="ví dụ: 110121001"
              value={mssv}
              onChange={(event) => setMssv(event.target.value)}
              maxLength={30}
              className="pl-10 font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Lớp học sinh hoạt *</label>
          <div className="relative">
            <Bookmark className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="ví dụ: DA21TT"
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              maxLength={50}
              className="pl-10 font-mono"
            />
          </div>
        </div>
      </div>

      {beforeActions}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        {secondaryAction}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-press flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" /> {submitLabel}
        </button>
      </div>
    </form>
  );
}
