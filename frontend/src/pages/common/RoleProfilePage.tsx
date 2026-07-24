import { Building2, Info, Mail, ShieldCheck, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { requireCurrentUser } from "../../state/authSession";
import { getRoleLabel } from "../../utils/roleHelpers";

interface RoleProfilePageProps {
  scope: "organizer" | "admin";
}

export default function RoleProfilePage({ scope }: RoleProfilePageProps) {
  const user = requireCurrentUser();
  const isAdmin = scope === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-left">
      <PageHeader
        eyebrow={getRoleLabel(user.role)}
        icon={ShieldCheck}
        title="Hồ sơ tài khoản"
        description="Thông tin định danh và phạm vi phụ trách được đồng bộ từ tài khoản nội bộ TVU."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            Đang hoạt động
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="enterprise-card p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="section-heading">Thông tin định danh</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Các trường này được cấp và quản lý bởi hệ thống, chỉ để tra cứu.</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Họ và tên</span>
              <span className="relative block">
                <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className="tvu-input bg-slate-50 pl-10 text-slate-500" value={user.fullName} disabled />
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
          </div>

          <div className="mt-6 flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4">
            <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-xs font-semibold leading-relaxed text-brand-800">
              Backend chưa có API cập nhật hồ sơ cho tài khoản Ban tổ chức/Quản trị viên. Khi có endpoint chính thức, các trường thông tin liên hệ sẽ được mở để chỉnh sửa tại đây.
            </p>
          </div>
        </section>

        <aside className="enterprise-card h-fit p-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-info-50 text-brand-700">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-base font-semibold text-slate-950">{isAdmin ? "Phạm vi quản trị" : "Câu lạc bộ phụ trách"}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {isAdmin
              ? "Tài khoản này có quyền quản trị toàn hệ thống, xem audit logs, quản lý CLB và tài khoản Ban tổ chức."
              : `${user.clubName || "CLB được phân công"}: chỉ thao tác với sự kiện, đăng ký, vé QR và check-in thuộc phạm vi CLB của mình.`}
          </p>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bảo mật</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              Hệ thống dùng phiên đăng nhập từ máy chủ. Không lưu JWT trong localStorage hoặc sessionStorage ở frontend.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
