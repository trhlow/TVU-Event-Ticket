import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import DemoDataBadge from "../../components/common/DemoDataBadge";
import { Input } from "../../components/ui/input";
import { formatDateTime } from "../../utils/formatDate";
import { AuditLog } from "../../types/audit";
import { auditLogService } from "../../services/auditLogService";
import { apiConfig } from "../../services/apiClient";

const PAGE_SIZE = 20;

export default function SuperAdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [available, setAvailable] = useState(apiConfig.useDemoData);
  const [loadError, setLoadError] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  useEffect(() => {
    let mounted = true;
    auditLogService
      .listRemote({ action: actionFilter.trim() || undefined, page, size: PAGE_SIZE })
      .then((result) => {
        if (!mounted) return;
        setLogs(result.items);
        setTotalPages(result.totalPages);
        setTotalElements(result.totalElements);
        setAvailable(true);
      })
      .catch(() => {
        if (mounted) {
          setAvailable(false);
          setLoadError(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [actionFilter, page]);

  const columns = [
    { header: "Thời gian", accessor: (log: AuditLog) => <span className="text-[10px] font-bold text-gray-400">{formatDateTime(log.createdAt)}</span> },
    { header: "Người thực hiện", accessor: (log: AuditLog) => <span className="block font-bold text-gray-950">{log.userName || log.actorName}</span> },
    { header: "Hành động", accessor: (log: AuditLog) => <span className="block font-mono text-xs font-semibold text-gray-700">{log.action}</span> },
    { header: "Đối tượng", accessor: (log: AuditLog) => <span className="text-xs font-semibold text-gray-500">{log.target}</span> },
    { header: "Chi tiết", accessor: (log: AuditLog) => <span className="text-xs text-gray-400">{log.result}</span> },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Nhật ký bảo mật và hoạt động"
        description="Audit log các thao tác quản trị, đọc trực tiếp từ GET /api/admin/audit-log."
        actions={
          available && (
            <div className="w-full sm:w-72">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Hành động (khớp chính xác)</span>
                <Input
                  value={actionFilter}
                  onChange={(event) => {
                    setPage(0);
                    setActionFilter(event.target.value);
                  }}
                  placeholder="vd: auth.club.create"
                  className="tvu-input"
                />
              </label>
            </div>
          )
        }
      />

      {!available ? (
        <BackendPendingNotice
          title={loadError ? "Không thể tải audit log" : "Đang tải audit log"}
          description={
            loadError
              ? "Không thể gọi GET /api/admin/audit-log (kiểm tra quyền SUPER_ADMIN hoặc kết nối backend)."
              : "Đang tải nhật ký hoạt động từ backend."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <DemoDataBadge />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs font-semibold text-slate-600">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {columns.map((column) => (
                    <th key={column.header} className="px-4 py-2.5">{column.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      {columns.map((column) => (
                        <td key={column.header} className="px-4 py-3">{column.accessor(log)}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-9 text-center text-sm font-semibold text-slate-400">
                      Không có nhật ký phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Trang <span className="text-slate-950">{page + 1}</span> / {totalPages} · Tổng số{" "}
                <span className="text-slate-950">{totalElements}</span> bản ghi
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  disabled={page === 0}
                  className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Trang sau"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
