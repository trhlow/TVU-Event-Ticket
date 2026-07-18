import React, { useState } from "react";
import { Eye, KeyRound, ShieldAlert } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import Dialog from "../../components/common/Dialog";

interface PermissionRow {
  key: string;
  group: string;
  description: string;
  student: boolean;
  organizer: boolean;
  admin: boolean;
}

const PERMISSIONS: PermissionRow[] = [
  { key: "event_manage", group: "Quản lý sự kiện", description: "Tạo, chỉnh sửa, công bố và theo dõi sự kiện.", student: false, organizer: true, admin: true },
  { key: "registration_review", group: "Duyệt đăng ký", description: "Duyệt hoặc từ chối đăng ký tham gia sự kiện.", student: false, organizer: true, admin: true },
  { key: "qr_scan", group: "Quét QR", description: "Quét QR vé điện tử để điểm danh sinh viên.", student: false, organizer: true, admin: true },
  { key: "club_manage", group: "Quản lý CLB", description: "Tạo mới, cập nhật và giám sát trạng thái CLB.", student: false, organizer: false, admin: true },
  { key: "account_manage", group: "Quản lý tài khoản", description: "Cấp tài khoản, khóa tài khoản và gán vai trò.", student: false, organizer: false, admin: true },
  { key: "statistics_view", group: "Xem thống kê", description: "Xem dashboard thống kê sự kiện, vé và điểm danh.", student: true, organizer: true, admin: true },
  { key: "audit_log", group: "Xem audit log", description: "Xem nhật ký thao tác và sự kiện bảo mật hệ thống.", student: false, organizer: false, admin: true },
];

const ROLE_CHECK = (enabled: boolean) => (
  <span
    className={`mx-auto grid h-8 w-8 place-items-center rounded-full border text-xs font-black ${
      enabled ? "border-success-200 bg-success-50 text-success-700" : "border-slate-200 bg-slate-50 text-slate-400"
    }`}
  >
    {enabled ? "✓" : "—"}
  </span>
);

export default function SuperAdminRBACPage() {
  const [selectedPermission, setSelectedPermission] = useState<PermissionRow | null>(null);

  const columns = [
    { header: "Nhóm quyền", accessor: (permission: PermissionRow) => <span className="block font-extrabold text-slate-950">{permission.group}</span> },
    { header: "Mô tả", accessor: (permission: PermissionRow) => <span className="block max-w-md font-semibold leading-6 text-slate-500">{permission.description}</span> },
    { header: "SINH_VIEN", accessor: (permission: PermissionRow) => ROLE_CHECK(permission.student), className: "text-center" },
    { header: "ORGANIZER", accessor: (permission: PermissionRow) => ROLE_CHECK(permission.organizer), className: "text-center" },
    { header: "SUPER_ADMIN", accessor: (permission: PermissionRow) => ROLE_CHECK(permission.admin), className: "text-center" },
    {
      header: "Chi tiết",
      accessor: (permission: PermissionRow) => (
        <div className="flex justify-end">
          <button onClick={() => setSelectedPermission(permission)} className="btn-press inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Xem
          </button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Phân quyền RBAC" }]}
        eyebrow="Chỉ đọc"
        icon={KeyRound}
        title="Ma trận phân quyền RBAC"
        description="Backend hiện thực thi phân quyền bằng quy tắc cố định trong mã nguồn (@PreAuthorize theo vai trò), không phải một cấu hình có thể chỉnh sửa qua giao diện. Bảng dưới đây phản ánh đúng quy tắc hiện có, chỉ để tra cứu."
      />

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

      <div className="rounded-2xl border border-info-100 bg-info-50 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
          <p className="text-sm font-semibold leading-6 text-brand-900">
            Đây là bảng tra cứu, không phải công cụ chỉnh sửa quyền — thay đổi quyền thật sự đòi hỏi sửa mã nguồn backend và triển khai lại dịch vụ.
          </p>
        </div>
      </div>

      <DataTable data={PERMISSIONS} columns={columns} searchPlaceholder="Tìm kiếm nhóm quyền..." searchField="group" />

      <Dialog
        isOpen={!!selectedPermission}
        onClose={() => setSelectedPermission(null)}
        title={selectedPermission?.group}
        footer={
          <button onClick={() => setSelectedPermission(null)} className="btn-press min-h-11 w-full rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700">
            Đóng
          </button>
        }
      >
        {selectedPermission && (
          <>
            <p className="text-sm font-semibold leading-6 text-slate-600">{selectedPermission.description}</p>
            <div className="mt-5 space-y-2">
              {[
                ["SINH_VIEN", selectedPermission.student],
                ["ORGANIZER", selectedPermission.organizer],
                ["SUPER_ADMIN", selectedPermission.admin],
              ].map(([role, enabled]) => (
                <div key={role as string} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-sm font-extrabold text-slate-700">{role as string}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${enabled ? "bg-success-50 text-success-700" : "bg-slate-200 text-slate-600"}`}>
                    {enabled ? "Được phép" : "Không"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
