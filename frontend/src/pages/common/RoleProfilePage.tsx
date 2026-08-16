import React, { useState } from "react";
import { Building2, Info, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { requireCurrentUser } from "../../state/authSession";
import { getRoleLabel } from "../../utils/roleHelpers";
import { authService } from "../../services/authService";
import { useToast } from "../../hooks/useToast";
import { Input } from "../../components/ui/input";
import SectionCard from "../../components/common/SectionCard";

interface RoleProfilePageProps {
  scope: "organizer" | "admin";
}

export default function RoleProfilePage({ scope }: RoleProfilePageProps) {
  const user = requireCurrentUser();
  const isAdmin = scope === "admin";
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveName = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed || trimmed === user.fullName) return;
    setIsSaving(true);
    try {
      const updated = await authService.updateDisplayName(trimmed);
      setFullName(updated.fullName);
      showToast("Cập nhật họ tên thành công.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể cập nhật họ tên.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-left">
      <PageHeader
        eyebrow={getRoleLabel(user.role)}
        icon={ShieldCheck}
        title="Hồ sơ tài khoản"
        description="Thông tin định danh và phạm vi phụ trách được đồng bộ từ tài khoản nội bộ TVU."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            Đang hoạt động
          </span>
        }
      />

      <div className={isAdmin ? "grid gap-6" : "grid gap-6 lg:grid-cols-[1fr_320px]"}>
        <SectionCard
          title="Thông tin định danh"
          description="Các trường này được cấp và quản lý bởi hệ thống, chỉ để tra cứu."
        >
          <form onSubmit={handleSaveName} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Họ và tên</span>
              <span className="relative flex items-center gap-2">
                <span className="relative flex-1">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input
                    className="pl-10"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={100}
                  />
                </span>
                <button
                  type="submit"
                  disabled={isSaving || !fullName.trim() || fullName.trim() === user.fullName}
                  className="btn-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-brand-600 px-3 text-xs font-extrabold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Lưu
                </button>
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className="tvu-input bg-slate-50 pl-10 text-slate-500" value={user.email} disabled />
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vai trò hệ thống</span>
              <input className="tvu-input bg-slate-50 text-slate-500" value={getRoleLabel(user.role)} disabled />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trạng thái tài khoản</span>
              <input className="tvu-input bg-slate-50 text-slate-500" value={user.status === "ACTIVE" ? "Đang hoạt động" : "Đã khóa"} disabled />
            </label>
          </form>

          <div className="mt-6 flex gap-3 rounded-card border border-info-100 bg-info-50/60 p-4">
            <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-xs font-semibold leading-relaxed text-brand-800">
              Bạn có thể chỉnh sửa họ và tên. Email, vai trò hệ thống và trạng thái tài khoản do hệ thống quản lý, chỉ để tra cứu.
            </p>
          </div>
        </SectionCard>

        {!isAdmin && (
          <aside className="enterprise-card h-fit p-5">
            <div className="grid h-10 w-10 place-items-center rounded-control bg-info-50 text-brand-700">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-display text-base font-semibold text-slate-950">Câu lạc bộ phụ trách</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {`${user.clubName || "CLB được phân công"}: chỉ thao tác với sự kiện, đăng ký, vé QR và check-in thuộc phạm vi CLB của mình.`}
            </p>
            <div className="mt-4 rounded-card border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bảo mật</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                Hệ thống dùng phiên đăng nhập từ máy chủ. Không lưu JWT trong localStorage hoặc sessionStorage ở frontend.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
