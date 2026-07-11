import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Save, ShieldAlert, User } from "lucide-react";
import { getCurrentUser } from "../../data/mockAuth";
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
      setErrorMsg("Vui long nhap MSSV.");
      return;
    }
    if (!className.trim()) {
      setErrorMsg("Vui long nhap lop hoc.");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");
    try {
      await authService.updateProfile({ mssv: mssv.trim(), classCode: className.trim().toUpperCase() });
      setToastMsg("Cap nhat ho so sinh vien thanh cong.");
      setTimeout(() => navigate("/student"), 800);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Khong the cap nhat ho so.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <Breadcrumb items={[{ label: "Sinh vien", path: "/student" }, { label: "Hoan tat ho so" }]} />

      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <div>
          <h2 className="text-lg font-black tracking-tight text-gray-950">Hoan thien ho so dang ky ve</h2>
          <p className="mt-1 text-xs font-semibold text-gray-500">Cap nhat MSSV va lop hoc truoc khi gui dang ky su kien.</p>
        </div>

        {errorMsg && (
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-[11px] font-bold text-rose-800">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Ho va ten</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={currentUser.fullName} disabled className="w-full rounded-xl border border-gray-200 bg-gray-100 py-2.5 pl-10 pr-4 text-xs font-semibold text-gray-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-gray-700">MSSV *</span>
              <input value={mssv} onChange={(event) => setMssv(event.target.value)} maxLength={30} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-xs font-bold text-gray-950 focus:border-brand-500 focus:bg-white focus:outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-gray-700">Lop hoc *</span>
              <input value={className} onChange={(event) => setClassName(event.target.value)} maxLength={50} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-xs font-bold text-gray-950 focus:border-brand-500 focus:bg-white focus:outline-none" />
            </label>
          </div>

          <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-left">
            <Info className="h-5 w-5 shrink-0 text-brand-600" />
            <p className="text-[10px] font-semibold leading-relaxed text-brand-800">Backend se re-issue cookie dang nhap sau khi ho so duoc cap nhat de reservation co MSSV hop le.</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={() => navigate("/student")} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">
              Quay lai
            </button>
            <button disabled={isSaving} type="submit" className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              <Save className="h-4 w-4" /> Cap nhat ho so
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
