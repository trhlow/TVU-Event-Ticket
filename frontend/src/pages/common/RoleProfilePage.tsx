import { Building2, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../state/authSession";
import { mockClubs } from "../../data/mockClubs";
import { getRoleLabel } from "../../utils/roleHelpers";

interface RoleProfilePageProps {
  scope: "organizer" | "admin";
}

export default function RoleProfilePage({ scope }: RoleProfilePageProps) {
  const user = getCurrentUser();
  const club = mockClubs.find((item) => item.id === user.clubId);
  const [phone, setPhone] = useState(user.phone || "");
  const [position, setPosition] = useState(scope === "organizer" ? "Phụ trách sự kiện CLB" : "Quản trị hệ thống");
  const [toastMsg, setToastMsg] = useState("");

  const isAdmin = scope === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-left">
      <Breadcrumb
        items={[
          { label: isAdmin ? "Quản trị hệ thống" : "Ban tổ chức", path: isAdmin ? "/admin" : "/organizer" },
          { label: "Hồ sơ tài khoản" },
        ]}
      />

      <section className="page-hero p-5 text-white md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              <ShieldCheck className="h-4 w-4" /> {getRoleLabel(user.role)}
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">Hồ sơ tài khoản</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/82">
              Quản lý thông tin định danh, phạm vi phụ trách và thông tin liên hệ dùng trong quy trình vận hành sự kiện.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-4 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Trạng thái</p>
            <p className="mt-1 text-base font-semibold text-white">Đang hoạt động</p>
          </div>
        </div>
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setToastMsg("Đã cập nhật hồ sơ tài khoản.");
        }}
        className="grid gap-6 lg:grid-cols-[1fr_320px]"
      >
        <section className="enterprise-card p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="section-heading">Thông tin chính</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Các trường định danh được đồng bộ từ tài khoản nội bộ TVU.</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Họ và tên</span>
              <span className="relative block">
                <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="tvu-input bg-slate-50 pl-10" value={user.fullName} disabled />
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="tvu-input bg-slate-50 pl-10" value={user.email} disabled />
              </span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chức danh</span>
              <input className="tvu-input" value={position} onChange={(event) => setPosition(event.target.value)} />
              <span className="block text-xs font-semibold text-slate-400">Dùng để hiển thị trong báo cáo và nhật ký xử lý.</span>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Số điện thoại liên hệ</span>
              <input className="tvu-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ví dụ: 0901234567" />
            </label>
          </div>

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
            <button className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              <Save className="h-4 w-4" /> Lưu hồ sơ
            </button>
          </div>
        </section>

        <aside className="enterprise-card h-fit p-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-base font-semibold text-slate-950">{isAdmin ? "Phạm vi quản trị" : "Câu lạc bộ phụ trách"}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {isAdmin
              ? "Tài khoản này có quyền quản trị toàn hệ thống, xem audit logs, quản lý CLB và tài khoản Ban tổ chức."
              : `${club?.name || user.clubName || "CLB được phân công"}: chỉ thao tác với sự kiện, đăng ký, vé QR và check-in thuộc phạm vi CLB.`}
          </p>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bảo mật</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              Hệ thống dùng phiên đăng nhập từ máy chủ. Không lưu JWT trong localStorage hoặc sessionStorage ở frontend.
            </p>
          </div>
        </aside>
      </form>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
