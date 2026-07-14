import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, XCircle } from 'lucide-react';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';
import DemoDataBadge from '../../components/common/DemoDataBadge';
import { User } from '../../types/user';
import { userService } from '../../services/userService';

const REQUIRED_ENDPOINTS = ['GET /admin/students', 'PATCH /admin/students/{id}/lock'];

export default function SuperAdminStudentsPage() {
  const [students, setStudents] = useState<User[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      setStudents(userService.listStudents());
    } catch {
      setStudents(null);
    }
  }, []);

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter((s) => {
      return (
        s.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
        (s.mssv && s.mssv.includes(search)) ||
        (s.className && s.className.toLowerCase().includes(search.toLowerCase()))
      );
    });
  }, [students, search]);

  const columns = [
    {
      header: 'Họ và tên / Email',
      accessor: (s: User) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{s.fullName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{s.email}</span>
        </div>
      )
    },
    {
      header: 'MSSV',
      accessor: (s: User) => (
        <span className="text-xs font-bold font-mono text-gray-800">{s.mssv || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Lớp học',
      accessor: (s: User) => (
        <span className="text-xs font-bold text-gray-700">{s.className || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Hồ Sơ',
      accessor: (s: User) => (
        <div className="flex items-center gap-1.5">
          {s.profileComplete ? (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded flex items-center gap-1 w-fit">
              <CheckCircle2 className="w-3.5 h-3.5" /> ĐỦ HỒ SƠ
            </span>
          ) : (
            <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded flex items-center gap-1 w-fit">
              <XCircle className="w-3.5 h-3.5" /> THIẾU MSSV
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Trạng Thái',
      accessor: (s: User) => <StatusBadge type="user" status={s.status} />
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Quản lý sinh viên' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Quản Lý Tài Khoản Sinh Viên</h2>
        <p className="text-xs text-gray-500 font-semibold font-sans">Tra cứu thông tin và giám sát hồ sơ cá nhân của sinh viên trong hệ thống.</p>
      </div>

      {students === null ? (
        <BackendPendingNotice
          description="Backend chưa có API liệt kê hoặc khóa/mở khóa tài khoản sinh viên. Trang này sẽ hiển thị dữ liệu thật ngay khi API sẵn sàng."
          requiredEndpoints={REQUIRED_ENDPOINTS}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="grid grow grid-cols-1 gap-4 bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tìm kiếm sinh viên</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tên, email, MSSV, lớp..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full max-w-md pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>
            <DemoDataBadge />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
            <DataTable
              data={filteredStudents}
              columns={columns}
              searchPlaceholder="Lọc nhanh danh sách..."
              searchField="fullName"
            />
          </div>
        </div>
      )}
    </div>
  );
}
