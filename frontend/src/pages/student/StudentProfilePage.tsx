import React, { useState } from 'react';
import { Info, Mail } from 'lucide-react';
import { requireCurrentUser } from '../../state/authSession';
import { authService } from '../../services/authService';
import { useToast } from '../../components/common/ToastProvider';
import PageHeader from '../../components/common/PageHeader';
import StudentProfileForm, { StudentProfileFormValues } from '../../components/student/StudentProfileForm';
import { Input } from '../../components/ui/input';

export default function StudentProfilePage() {
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async ({ mssv, className }: StudentProfileFormValues) => {
    setIsSaving(true);
    try {
      // Real persistence via PATCH /auth/me/profile — the only student-profile fields the
      // backend stores are mssv + classCode. No client-only "save" that fakes success.
      await authService.updateProfile({ mssv, classCode: className });
      showToast('Cập nhật thông tin tài khoản thành công.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <PageHeader
        title="Hồ sơ cá nhân sinh viên"
        description="Quản lý thông tin định danh phục vụ đăng ký và cấp vé sự kiện."
      />

      <div className="enterprise-card space-y-6 p-6 md:p-8">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Địa chỉ email học tập</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input type="text" value={currentUser.email} disabled className="bg-slate-100 pl-10 text-slate-500" />
          </div>
        </div>

        <StudentProfileForm
          fullName={currentUser.fullName}
          initialValues={{ mssv: currentUser.mssv || '', className: currentUser.className || '' }}
          onSubmit={handleSave}
          submitLabel="Lưu thông tin"
          isSubmitting={isSaving}
          fullNameHint="Đồng bộ từ tài khoản Microsoft của trường."
          beforeActions={
            <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
              <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
              <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
                Backend chỉ lưu MSSV và lớp học cho hồ sơ sinh viên. Số điện thoại chưa nằm trong hợp đồng API nên chưa được lưu tại đây.
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
