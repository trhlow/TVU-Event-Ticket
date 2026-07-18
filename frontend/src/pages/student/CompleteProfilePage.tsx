import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { requireCurrentUser } from "../../state/authSession";
import { useToast } from "../../components/common/ToastProvider";
import PageHeader from "../../components/common/PageHeader";
import StudentProfileForm, { StudentProfileFormValues } from "../../components/student/StudentProfileForm";
import { authService } from "../../services/authService";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async ({ mssv, className }: StudentProfileFormValues) => {
    setIsSaving(true);
    try {
      await authService.updateProfile({ mssv, classCode: className });
      showToast("Cập nhật hồ sơ sinh viên thành công.");
      setTimeout(() => navigate("/student"), 800);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Sinh viên", path: "/student" }, { label: "Hoàn tất hồ sơ" }]}
        title="Hoàn thiện hồ sơ đăng ký vé"
        description="Cập nhật MSSV và lớp học trước khi gửi đăng ký sự kiện."
      />

      <div className="enterprise-card space-y-6 p-6 md:p-8">
        <StudentProfileForm
          fullName={currentUser.fullName}
          initialValues={{ mssv: currentUser.mssv || "", className: currentUser.className || "" }}
          onSubmit={handleSave}
          submitLabel="Cập nhật hồ sơ"
          isSubmitting={isSaving}
          secondaryAction={
            <button
              type="button"
              onClick={() => navigate("/student")}
              className="btn-press rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Quay lại
            </button>
          }
          beforeActions={
            <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
              <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
              <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
                Backend sẽ cấp lại cookie đăng nhập sau khi hồ sơ được cập nhật để đăng ký có MSSV hợp lệ.
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
