import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Save, ShieldAlert, User } from "lucide-react";
import { getCurrentUser } from "../../state/authSession";
import Toast from "../../components/common/Toast";
import Breadcrumb from "../../components/common/Breadcrumb";
import { authService } from "../../services/authService";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [mssv, setMssv] = useState(currentUser.mssv || "");
  const [className, setClassName] = useState(currentUser.className || "");
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mssv.trim()) {
      setErrorMsg("Vui lòng nhập MSSV.");
      return;
    }
    if (!className.trim()) {
      setErrorMsg("Vui lòng nhập lớp học.");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");
    try {
      await authService.updateProfile({ mssv: mssv.trim(), classCode: className.trim().toUpperCase() });
      setToastMsg("Cập nhật hồ sơ sinh viên thành công.");
      setTimeout(() => navigate("/student"), 800);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <Breadcrumb items={[{ label: "Sinh viên", path: "/student" }, { label: "Hoàn tất hồ sơ" }]} />

      <div className="enterprise-card space-y-6 p-6 md:p-8">
        <div>
          <h2 className="tvu-page-title text-lg">Hoàn thiện hồ sơ đăng ký vé</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Cập nhật MSSV và lớp học trước khi gửi đăng ký sự kiện.</p>
        </div>

        {errorMsg && (
          <div className="flex gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3.5 text-[11px] font-bold text-danger-700">
            <ShieldAlert className="h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Họ và tên</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={currentUser.fullName} disabled className="tvu-input bg-slate-100 pl-10 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">MSSV *</span>
              <input value={mssv} onChange={(event) => setMssv(event.target.value)} maxLength={30} className="tvu-input font-mono" />
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">Lớp học *</span>
              <input value={className} onChange={(event) => setClassName(event.target.value)} maxLength={50} className="tvu-input font-mono" />
            </label>
          </div>

          <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
            <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
              Backend sẽ cấp lại cookie đăng nhập sau khi hồ sơ được cập nhật để đăng ký có MSSV hợp lệ.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => navigate("/student")} className="btn-press rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Quay lại
            </button>
            <button disabled={isSaving} type="submit" className="btn-press flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" /> Cập nhật hồ sơ
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
