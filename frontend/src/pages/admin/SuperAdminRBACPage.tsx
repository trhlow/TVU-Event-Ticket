import React, { useState } from "react";
import { Check, Eye, KeyRound, Save, ShieldAlert, X } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";

interface PermissionRow {
  key: string;
  group: string;
  description: string;
  student: boolean;
  organizer: boolean;
  admin: boolean;
}

const initialPermissions: PermissionRow[] = [
  { key: "event_manage", group: "Quản lý sự kiện", description: "Tạo, chỉnh sửa, công bố và theo dõi sự kiện.", student: false, organizer: true, admin: true },
  { key: "registration_review", group: "Duyệt đăng ký", description: "Duyệt hoặc từ chối đăng ký tham gia sự kiện.", student: false, organizer: true, admin: true },
  { key: "qr_scan", group: "Quét QR", description: "Quét QR vé điện tử để điểm danh sinh viên.", student: false, organizer: true, admin: true },
  { key: "club_manage", group: "Quản lý CLB", description: "Tạo mới, cập nhật và giám sát trạng thái CLB.", student: false, organizer: false, admin: true },
  { key: "account_manage", group: "Quản lý tài khoản", description: "Cấp tài khoản, khóa tài khoản và gán vai trò.", student: false, organizer: false, admin: true },
  { key: "statistics_view", group: "Xem thống kê", description: "Xem dashboard thống kê sự kiện, vé và điểm danh.", student: true, organizer: true, admin: true },
  { key: "audit_log", group: "Xem audit log", description: "Xem nhật ký thao tác và sự kiện bảo mật hệ thống.", student: false, organizer: false, admin: true },
];

export default function SuperAdminRBACPage() {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [selectedPermission, setSelectedPermission] = useState<PermissionRow | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const togglePermission = (index: number, role: "student" | "organizer" | "admin") => {
    setPermissions((current) => current.map((permission, idx) => (idx === index ? { ...permission, [role]: !permission[role] } : permission)));
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Phân quyền RBAC" }]} />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-brand-700" />
            <h1 className="tvu-page-title text-2xl">Quản lý Phân quyền RBAC</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Thiết lập ma trận quyền theo vai trò SINH_VIEN, ORGANIZER và SUPER_ADMIN. Các thay đổi hiện là cấu hình giao diện để sẵn sàng nối API.
          </p>
        </div>
        <button
          onClick={() => setToastMsg("Đã ghi nhận cấu hình phân quyền. Khi backend sẵn sàng, thao tác này sẽ gọi API RBAC.")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700"
        >
          <Save className="h-4 w-4" />
          Lưu ma trận quyền
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["SINH_VIEN", "Truy cập sự kiện, đăng ký, xem vé QR cá nhân."],
          ["ORGANIZER", "Quản lý sự kiện CLB, duyệt đăng ký và điểm danh."],
          ["SUPER_ADMIN", "Quản trị CLB, tài khoản, RBAC và giám sát hệ thống."],
        ].map(([role, description]) => (
          <div key={role} className="enterprise-card p-5">
            <p className="font-display text-base font-extrabold text-slate-950">{role}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
          <p className="text-sm font-semibold leading-6 text-brand-900">
            Không kích hoạt thao tác nguy hiểm khi backend RBAC chưa sẵn sàng. Giao diện này giữ đúng ma trận quyền để nối API sau.
          </p>
        </div>
      </div>

      <div className="enterprise-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="p-4">Nhóm quyền</th>
                <th className="p-4">Mô tả</th>
                <th className="p-4 text-center">SINH_VIEN</th>
                <th className="p-4 text-center">ORGANIZER</th>
                <th className="p-4 text-center">SUPER_ADMIN</th>
                <th className="p-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {permissions.map((permission, index) => (
                <tr key={permission.key} className="hover:bg-blue-50/30">
                  <td className="p-4 font-extrabold text-slate-950">{permission.group}</td>
                  <td className="max-w-md p-4 font-semibold leading-6 text-slate-500">{permission.description}</td>
                  {(["student", "organizer", "admin"] as const).map((role) => (
                    <td key={role} className="p-4 text-center">
                      <button
                        onClick={() => togglePermission(index, role)}
                        className={`mx-auto grid h-9 w-14 place-items-center rounded-full border transition ${
                          permission[role] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                        aria-label={`Bật tắt quyền ${permission.group}`}
                      >
                        {permission[role] ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                    </td>
                  ))}
                  <td className="p-4 text-right">
                    <button onClick={() => setSelectedPermission(permission)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                      <Eye className="h-4 w-4" />
                      Xem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPermission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setSelectedPermission(null)} aria-label="Đóng" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="font-display text-lg font-extrabold text-slate-950">{selectedPermission.group}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{selectedPermission.description}</p>
            <div className="mt-5 space-y-2">
              {[
                ["SINH_VIEN", selectedPermission.student],
                ["ORGANIZER", selectedPermission.organizer],
                ["SUPER_ADMIN", selectedPermission.admin],
              ].map(([role, enabled]) => (
                <div key={role as string} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-sm font-extrabold text-slate-700">{role as string}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                    {enabled ? "Được phép" : "Tắt"}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setSelectedPermission(null)} className="mt-6 min-h-11 w-full rounded-xl bg-brand-600 text-sm font-extrabold text-white">
              Đóng
            </button>
          </div>
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
