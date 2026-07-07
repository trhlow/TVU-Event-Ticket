import React, { useState } from 'react';
import { Search, Plus, Lock, Unlock, X } from 'lucide-react';
import { mockUsers } from '../../data/mockUsers';
import { mockClubs } from '../../data/mockClubs';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Toast from '../../components/common/Toast';
import { User } from '../../types/user';

export default function SuperAdminOrganizersPage() {
  const [users, setUsers] = useState(() => 
    mockUsers.filter(u => u.role === 'ORGANIZER')
  );
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', clubId: mockClubs[0]?.id || '' });

  const handleToggleStatus = (userId: string) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        const newStatus = u.status === 'ACTIVE' ? 'LOCKED' as const : 'ACTIVE' as const;
        setToastMsg(`Đã chuyển trạng thái tài khoản ${u.fullName} sang ${newStatus === 'ACTIVE' ? 'kích hoạt' : 'khóa'}.`);
        return { ...u, status: newStatus };
      }
      return u;
    });
    setUsers(updated);
  };

  const handleCreateOrganizer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.clubId) return;

    const club = mockClubs.find((item) => item.id === form.clubId);
    const newUser: User = {
      id: `user_org_new_${Date.now()}`,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      role: 'ORGANIZER' as const,
      clubId: form.clubId,
      clubName: club?.name,
      profileComplete: true,
      status: 'ACTIVE' as const
    };

    setUsers([newUser, ...users]);
    setToastMsg('Đã cấp tài khoản Ban tổ chức mới.');
    setCreateOpen(false);
    setForm({ fullName: '', email: '', clubId: mockClubs[0]?.id || '' });
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
      accessor: (u: User) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{u.fullName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{u.email}</span>
        </div>
      )
    },
    {
      header: 'Câu Lạc Bộ Quản Lý',
      accessor: (u: User) => {
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
      accessor: (u: User) => <StatusBadge type="user" status={u.status} />
    },
    {
      header: 'Thao tác',
      accessor: (u: User) => (
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
          onClick={() => setCreateOpen(true)}
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

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setCreateOpen(false)} aria-label="Đóng" />
          <form onSubmit={handleCreateOrganizer} className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button type="button" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => setCreateOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-lg font-extrabold text-slate-950">Cấp tài khoản Ban tổ chức</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Tạo tài khoản đại diện CLB. Tài khoản này chỉ được thao tác với sự kiện, đăng ký và vé QR thuộc CLB được gán.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Họ và tên</span>
                <input className="tvu-input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Ví dụ: Nguyễn Văn Bình" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Email nội bộ</span>
                <input className="tvu-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="organizer@tvu.edu.vn" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Câu lạc bộ phụ trách</span>
                <select className="tvu-input" value={form.clubId} onChange={(event) => setForm({ ...form, clubId: event.target.value })}>
                  {mockClubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setCreateOpen(false)}>Hủy bỏ</button>
              <button type="submit" className="min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">Cấp tài khoản</button>
            </div>
          </form>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
