import React, { useMemo, useState } from 'react';
import { mockAuditLogs } from '../../data/mockAuditLogs';
import DataTable from '../../components/common/DataTable';
import Breadcrumb from '../../components/common/Breadcrumb';
import { formatDateTime } from '../../utils/formatDate';
import { AuditLog } from '../../types/audit';

export default function SuperAdminLogsPage() {
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");

  const filteredLogs = useMemo(
    () =>
      mockAuditLogs.filter((log) => {
        const matchesRole = roleFilter === "ALL" || log.role === roleFilter;
        const matchesAction = actionFilter === "ALL" || log.action.toLowerCase().includes(actionFilter.toLowerCase());
        return matchesRole && matchesAction;
      }),
    [roleFilter, actionFilter],
  );

  const columns = [
    {
      header: 'Thời Gian',
      accessor: (log: AuditLog) => (
        <span className="text-[10px] text-gray-400 font-bold">{formatDateTime(log.createdAt)}</span>
      ),
    },
    {
      header: 'Người Thực Hiện',
      accessor: (log: AuditLog) => (
        <span className="font-bold text-gray-950 block">{log.userName}</span>
      ),
    },
    {
      header: 'Vai Trò',
      accessor: (log: AuditLog) => (
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
          log.role === 'SUPER_ADMIN'
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : log.role === 'ORGANIZER'
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-brand-50 border-brand-200 text-brand-700'
        }`}>
          {log.role === 'SUPER_ADMIN' ? 'QTV' : log.role === 'ORGANIZER' ? 'BTC CLB' : 'Sinh viên'}
        </span>
      ),
    },
    {
      header: 'Hành Động Hệ Thống',
      accessor: (log: AuditLog) => (
        <span className="font-semibold text-gray-700 block">{log.action}</span>
      ),
    },
    {
      header: 'Địa Chỉ IP',
      accessor: (log: AuditLog) => (
        <span className="font-mono font-bold text-gray-400 text-[10px]">{log.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Nhật ký hệ thống' }]} />

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="space-y-1">
          <h1 className="tvu-page-title text-2xl">Nhật ký bảo mật và hoạt động</h1>
          <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            Bản ghi kiểm toán toàn bộ hoạt động đăng ký, cấp phát vé QR, điểm danh check-in và thay đổi cấu hình hệ thống.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:w-[460px]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Vai trò</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="tvu-input">
              <option value="ALL">Tất cả vai trò</option>
              <option value="SINH_VIEN">Sinh viên</option>
              <option value="ORGANIZER">Ban tổ chức</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Nhóm hành động</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="tvu-input">
              <option value="ALL">Tất cả</option>
              <option value="đăng ký">Đăng ký</option>
              <option value="vé">Vé QR</option>
              <option value="check-in">Check-in</option>
              <option value="CLB">Câu lạc bộ</option>
            </select>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <DataTable
          data={filteredLogs}
          columns={columns}
          searchPlaceholder="Tìm kiếm hành động, người dùng..."
          searchField="action"
          renderMobileCard={(log: AuditLog) => (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-950 text-sm truncate">{log.userName}</p>
                  <p className="text-xs font-bold text-gray-700 mt-1">{log.action}</p>
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                  log.role === 'SUPER_ADMIN'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : log.role === 'ORGANIZER'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-brand-50 border-brand-200 text-brand-700'
                }`}>
                  {log.role === 'SUPER_ADMIN' ? 'QTV' : log.role === 'ORGANIZER' ? 'BTC CLB' : 'Sinh viên'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-[10px] font-bold text-gray-400">
                <span>{formatDateTime(log.createdAt)}</span>
                <span className="font-mono">{log.ipAddress}</span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}
