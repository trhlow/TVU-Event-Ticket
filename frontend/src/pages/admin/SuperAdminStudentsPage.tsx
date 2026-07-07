import React, { useState } from 'react';
import { Search, Lock, Unlock, CheckCircle2, XCircle } from 'lucide-react';
import { mockUsers } from '../../data/mockUsers';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';

export default function SuperAdminStudentsPage() {
  const [students, setStudents] = useState(() => 
    mockUsers.filter(u => u.role === 'SINH_VIEN')
  );
  const [search, setSearch] = useState('');

  const handleToggleStatus = (studentId: string) => {
    const updated = students.map(s => {
      if (s.id === studentId) {
        const newStatus = s.status === 'ACTIVE' ? 'LOCKED' as const : 'ACTIVE' as const;
        alert(`Đã chuyển trạng thái tài khoản sinh viên ${s.fullName} sang ${newStatus === 'ACTIVE' ? 'Kích hoạt' : 'Khóa'}`);
        return { ...s, status: newStatus };
      }
      return s;
    });
    setStudents(updated);
  };

  const filteredStudents = students.filter(s => {
    return (
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
      (s.mssv && s.mssv.includes(search)) ||
      (s.className && s.className.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const columns = [
    {
      header: 'Họ và tên / Email',
      accessor: (s: any) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{s.fullName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{s.email}</span>
        </div>
      )
    },
    {
      header: 'MSSV',
      accessor: (s: any) => (
        <span className="text-xs font-bold font-mono text-gray-800">{s.mssv || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Lớp học',
      accessor: (s: any) => (
        <span className="text-xs font-bold text-gray-700">{s.className || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Hồ Sơ',
      accessor: (s: any) => (
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
      accessor: (s: any) => <StatusBadge type="user" status={s.status} />
    },
    {
      header: 'Thao tác',
      accessor: (s: any) => (
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => handleToggleStatus(s.id)}
            className={`p-1.5 border border-gray-100 rounded-lg transition-colors cursor-pointer ${
              s.status === 'ACTIVE' 
                ? 'text-rose-600 hover:bg-rose-50 hover:border-rose-200' 
                : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
            }`}
            title={s.status === 'ACTIVE' ? 'Khóa tài khoản sinh viên' : 'Kích hoạt tài khoản'}
          >
            {s.status === 'ACTIVE' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Quản lý sinh viên' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Quản Lý Tài Khoản Sinh Viên</h2>
        <p className="text-xs text-gray-500 font-semibold font-sans">Tra cứu thông tin, giám sát hồ sơ cá nhân và khóa đặc quyền đăng ký đối với các tài khoản vi phạm chính sách của nhà trường</p>
      </div>

      <div className="grid grid-cols-1 gap-4 bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
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

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
        <DataTable 
          data={filteredStudents}
          columns={columns}
          searchPlaceholder="Lọc nhanh danh sách..."
          searchField="fullName"
        />
      </div>
    </div>
  );
}
