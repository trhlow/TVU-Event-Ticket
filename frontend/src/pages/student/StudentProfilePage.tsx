import React, { useState } from 'react';
import { Bookmark, CreditCard, Info, Mail, Save, ShieldAlert, User } from 'lucide-react';
import { requireCurrentUser } from '../../state/authSession';
import { authService } from '../../services/authService';
import Toast from '../../components/common/Toast';
import PageHeader from '../../components/common/PageHeader';

export default function StudentProfilePage() {
  const currentUser = requireCurrentUser();

  const [mssv, setMssv] = useState(currentUser.mssv || '');
  const [className, setClassName] = useState(currentUser.className || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!mssv.trim()) {
      setErrorMsg('Vui lòng nhập MSSV.');
      return;
    }
    if (!className.trim()) {
      setErrorMsg('Vui lòng nhập lớp học.');
      return;
    }

    setIsSaving(true);
    try {
      // Real persistence via PATCH /auth/me/profile — the only student-profile fields the
      // backend stores are mssv + classCode. No client-only "save" that fakes success.
      await authService.updateProfile({ mssv: mssv.trim(), classCode: className.trim().toUpperCase() });
      setToastMsg('Cập nhật thông tin tài khoản thành công.');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: 'Sinh viên', path: '/student' }, { label: 'Tài khoản' }]}
        title="Hồ sơ cá nhân sinh viên"
        description="Quản lý thông tin định danh phục vụ đăng ký và cấp vé sự kiện."
      />

      <div className="enterprise-card space-y-6 p-6 md:p-8">
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
              <input type="text" value={currentUser.fullName} disabled className="tvu-input bg-slate-100 pl-10 text-slate-500" />
            </div>
            <p className="text-[10px] font-semibold text-slate-400">Đồng bộ từ tài khoản Microsoft của trường.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Địa chỉ email học tập</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="text" value={currentUser.email} disabled className="tvu-input bg-slate-100 pl-10 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Mã số sinh viên (MSSV) *</label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="text" placeholder="ví dụ: 110121001" value={mssv} onChange={(e) => setMssv(e.target.value)} maxLength={30} className="tvu-input pl-10 font-mono" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Lớp học sinh hoạt *</label>
              <div className="relative">
                <Bookmark className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="text" placeholder="ví dụ: DA21TT" value={className} onChange={(e) => setClassName(e.target.value)} maxLength={50} className="tvu-input pl-10 font-mono" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
            <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
              Backend chỉ lưu MSSV và lớp học cho hồ sơ sinh viên. Số điện thoại chưa nằm trong hợp đồng API nên chưa được lưu tại đây.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="submit" disabled={isSaving} className="btn-press flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" /> Lưu thông tin
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
