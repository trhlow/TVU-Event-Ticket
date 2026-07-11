import React, { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/common/DataTable";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import { AuditLog } from "../../types/audit";
import { auditLogService } from "../../services/auditLogService";

export default function SuperAdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    auditLogService.listRemote()
      .then(setLogs)
      .catch((error) => setToastMsg(error instanceof Error ? error.message : "Backend chua ho tro audit log."));
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
    { header: "Thoi gian", accessor: (log: AuditLog) => <span className="text-[10px] font-bold text-gray-400">{formatDateTime(log.createdAt)}</span> },
    { header: "Nguoi thuc hien", accessor: (log: AuditLog) => <span className="block font-bold text-gray-950">{log.userName || log.actorName}</span> },
    { header: "Vai tro", accessor: (log: AuditLog) => <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-700">{log.role || log.actorRole}</span> },
    { header: "Hanh dong", accessor: (log: AuditLog) => <span className="block font-semibold text-gray-700">{log.action}</span> },
    { header: "IP", accessor: (log: AuditLog) => <span className="font-mono text-[10px] font-bold text-gray-400">{log.ipAddress}</span> },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Quan tri he thong", path: "/admin" }, { label: "Nhat ky he thong" }]} />

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-1">
          <h1 className="tvu-page-title text-2xl">Nhat ky bao mat va hoat dong</h1>
          <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500">Backend hien ghi audit log nhung chua expose API doc log cho frontend.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[460px]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Vai tro</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="tvu-input">
              <option value="ALL">Tat ca</option>
              <option value="SINH_VIEN">Sinh vien</option>
              <option value="ORGANIZER">Ban to chuc</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Hanh dong</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="tvu-input">
              <option value="ALL">Tat ca</option>
              <option value="ticket">Ticket</option>
              <option value="event">Event</option>
              <option value="auth">Auth</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <DataTable data={filteredLogs} columns={columns} searchPlaceholder="Tim kiem hanh dong..." searchField="action" />
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
