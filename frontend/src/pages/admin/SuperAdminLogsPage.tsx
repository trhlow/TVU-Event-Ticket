import React from 'react';
import { mockAuditLogs } from '../../data/mockAuditLogs';
import DataTable from '../../components/common/DataTable';
import Breadcrumb from '../../components/common/Breadcrumb';
import { formatDateTime } from '../../utils/formatDate';
import { AuditLog } from '../../types/audit';

export default function SuperAdminLogsPage() {
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

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Nhật Ký Bảo Mật & Hoạt Động</h2>
        <p className="text-xs text-gray-500 font-semibold">Bản ghi vết kiểm toán toàn bộ hoạt động đăng ký, cấp phát vé và điểm danh check-in</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <DataTable
          data={mockAuditLogs}
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
