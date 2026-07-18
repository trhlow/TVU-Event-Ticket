import React, { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import DemoDataBadge from "../../components/common/DemoDataBadge";
import { formatDateTime } from "../../utils/formatDate";
import { AuditLog } from "../../types/audit";
import { auditLogService } from "../../services/auditLogService";
import { apiConfig } from "../../services/apiClient";

const REQUIRED_ENDPOINTS = ["GET /admin/audit-logs?role=&action=&page=&size="];

export default function SuperAdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [available, setAvailable] = useState(apiConfig.useDemoData);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");

  useEffect(() => {
    auditLogService
      .listRemote()
      .then((result) => {
        setLogs(result);
        setAvailable(true);
      })
      .catch(() => setAvailable(false));
  }, []);

  const filteredLogs = useMemo(
    () => logs.filter((log) => {
      const matchesRole = roleFilter === "ALL" || log.role === roleFilter;
      const matchesAction = actionFilter === "ALL" || log.action.toLowerCase().includes(actionFilter.toLowerCase());
      return matchesRole && matchesAction;
    }),
    [logs, roleFilter, actionFilter],
  );

  const columns = [
    { header: "Thời gian", accessor: (log: AuditLog) => <span className="text-[10px] font-bold text-gray-400">{formatDateTime(log.createdAt)}</span> },
    { header: "Người thực hiện", accessor: (log: AuditLog) => <span className="block font-bold text-gray-950">{log.userName || log.actorName}</span> },
    { header: "Vai trò", accessor: (log: AuditLog) => <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-700">{log.role || log.actorRole}</span> },
    { header: "Hành động", accessor: (log: AuditLog) => <span className="block font-semibold text-gray-700">{log.action}</span> },
    { header: "IP", accessor: (log: AuditLog) => <span className="font-mono text-[10px] font-bold text-gray-400">{log.ipAddress}</span> },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Nhật ký bảo mật và hoạt động"
        description="Backend hiện ghi audit log cho các thao tác quản trị nhưng chưa expose API đọc log cho frontend."
        actions={
          available && (
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[460px]">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Vai trò</span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="tvu-input">
                  <option value="ALL">Tất cả</option>
                  <option value="SINH_VIEN">Sinh viên</option>
                  <option value="ORGANIZER">Ban tổ chức</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Hành động</span>
                <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="tvu-input">
                  <option value="ALL">Tất cả</option>
                  <option value="ticket">Ticket</option>
                  <option value="event">Event</option>
                  <option value="auth">Auth</option>
                </select>
              </label>
            </div>
          )
        }
      />

      {!available ? (
        <BackendPendingNotice
          description="Backend chưa expose API đọc audit log cho Super Admin. Trang này sẽ hiển thị nhật ký thật ngay khi endpoint bên dưới sẵn sàng."
          requiredEndpoints={REQUIRED_ENDPOINTS}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <DemoDataBadge />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <DataTable data={filteredLogs} columns={columns} searchPlaceholder="Tìm kiếm hành động..." searchField="action" />
          </div>
        </div>
      )}
    </div>
  );
}
