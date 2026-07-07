import React, { useState } from 'react';
import { Search, Plus, Lock, Unlock } from 'lucide-react';
import { mockUsers } from '../../data/mockUsers';
import { mockClubs } from '../../data/mockClubs';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';

export default function SuperAdminOrganizersPage() {
  const [users, setUsers] = useState(() => 
    mockUsers.filter(u => u.role === 'ORGANIZER')
  );
  const [search, setSearch] = useState('');

  const handleToggleStatus = (userId: string) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        const newStatus = u.status === 'ACTIVE' ? 'LOCKED' as const : 'ACTIVE' as const;
        alert(`Đã chuyển trạng thái tài khoản ${u.fullName} sang ${newStatus === 'ACTIVE' ? 'Kích hoạt' : 'Khóa'}`);
        return { ...u, status: newStatus };
      }
      return u;
    });
    setUsers(updated);
  };

  const handleCreateOrganizer = () => {
    const name = prompt('Nhập tên Ban tổ chức mới:');
    if (!name) return;
    const email = prompt('Nhập email Ban tổ chức:');
    if (!email) return;
    const clubCode = prompt('Nhập ID câu lạc bộ (Ví dụ: club_it, club_music, club_english):');
    if (!clubCode) return;

    const newUser = {
      id: `user_org_new_${Date.now()}`,
      fullName: name,
      email: email,
      role: 'ORGANIZER' as const,
      clubId: clubCode,
      profileComplete: true,
      status: 'ACTIVE' as const
    };

    setUsers([newUser, ...users]);
    alert('Thêm tài khoản Ban tổ chức mới thành công!');
  };

  const filteredUsers = users.filter(u => {
    const club = mockClubs.find(c => c.id === u.clubId);
    const clubName = club ? club.name : 'Chưa phân CLB';
    return (
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      clubName.toLowerCase().includes(search.toLowerCase())
    );
  });

  const columns = [
    {
      header: 'Họ và tên / Email',
      accessor: (u: any) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{u.fullName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{u.email}</span>
        </div>
      )
    },
    {
      header: 'Câu Lạc Bộ Quản Lý',
      accessor: (u: any) => {
        const club = mockClubs.find(c => c.id === u.clubId);
        return (
          <span className="text-xs font-bold text-gray-700">
            {club ? club.name : 'Chưa phân câu lạc bộ'}
          </span>
        );
      }
    },
    {
      header: 'Trạng Thái',
      accessor: (u: any) => <StatusBadge type="user" status={u.status} />
    },
    {
      header: 'Thao tác',
      accessor: (u: any) => (
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => handleToggleStatus(u.id)}
            className={`p-1.5 border border-gray-100 rounded-lg transition-colors cursor-pointer ${
              u.status === 'ACTIVE' 
                ? 'text-rose-600 hover:bg-rose-50 hover:border-rose-200' 
                : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
            }`}
            title={u.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
          >
            {u.status === 'ACTIVE' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Quản lý Ban tổ chức' }]} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-950 tracking-tight">Quản Lý Tài Khoản Ban Tổ Chức</h2>
          <p className="text-xs text-gray-500 font-semibold font-sans">Quản lý phân công tài khoản đại diện Ban chủ nhiệm các Câu lạc bộ Đại học Trà Vinh</p>
        </div>
        <button
          onClick={handleCreateOrganizer}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-brand-600/10"
        >
          <Plus className="w-4 h-4" /> Cấp tài khoản mới
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tìm kiếm tài khoản Ban tổ chức</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Tên, email, hoặc câu lạc bộ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
        <DataTable 
          data={filteredUsers}
          columns={columns}
          searchPlaceholder="Lọc nhanh danh sách..."
          searchField="fullName"
        />
      </div>
    </div>
  );
}
