import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Search, X } from "lucide-react";
import { mockClubs } from "../../data/mockClubs";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { User } from "../../types/user";
import { userService } from "../../services/userService";
import { clubService } from "../../services/clubService";
import { Club } from "../../types/club";

export default function SuperAdminOrganizersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [clubs, setClubs] = useState<Club[]>(mockClubs);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", clubId: mockClubs[0]?.id || "" });

  const loadData = useCallback(async () => {
    try {
      const [organizers, clubItems] = await Promise.all([userService.listOrganizersRemote(), clubService.listRemote()]);
      setUsers(organizers);
      setClubs(clubItems);
      if (!form.clubId && clubItems[0]) setForm((value) => ({ ...value, clubId: clubItems[0].id }));
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tai tai khoan organizer.");
    }
  }, [form.clubId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLock = async (userId: string) => {
    try {
      await userService.lockOrganizer(userId);
      setToastMsg("Da khoa tai khoan organizer.");
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the khoa tai khoan.");
    }
  };

  const handleCreateOrganizer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.clubId) return;
    try {
      await userService.createOrganizer({ email: form.email.trim(), displayName: form.fullName.trim(), clubId: form.clubId });
      setToastMsg("Da cap tai khoan Ban to chuc moi.");
      setCreateOpen(false);
      setForm({ fullName: "", email: "", clubId: clubs[0]?.id || "" });
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tao organizer.");
    }
  };

  const filteredUsers = useMemo(() => users.filter((user) => {
    const club = clubs.find((item) => item.id === user.clubId);
    const clubName = club ? club.name : "Chua phan CLB";
    return `${user.fullName} ${user.email} ${clubName}`.toLowerCase().includes(search.toLowerCase());
  }), [users, clubs, search]);

  const columns = [
    {
      header: "Ho va ten / Email",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-gray-950">{user.fullName}</span>
          <span className="mt-0.5 block text-[10px] text-gray-400">{user.email}</span>
        </div>
      ),
    },
    {
      header: "CLB quan ly",
      accessor: (user: User) => <span className="text-xs font-bold text-gray-700">{clubs.find((club) => club.id === user.clubId)?.name || "Chua phan CLB"}</span>,
    },
    { header: "Trang thai", accessor: (user: User) => <StatusBadge type="user" status={user.status} /> },
    {
      header: "Thao tac",
      accessor: (user: User) => (
        <div className="flex justify-end gap-1">
          {user.status === "ACTIVE" && (
            <button onClick={() => handleLock(user.id)} className="cursor-pointer rounded-lg border border-gray-100 p-1.5 text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50" title="Khoa tai khoan">
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Quan tri he thong", path: "/admin" }, { label: "Quan ly Ban to chuc" }]} />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-gray-950">Quan ly tai khoan Ban to chuc</h2>
          <p className="text-xs font-semibold text-gray-500">Tao va khoa organizer qua backend Auth/Admin service.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold tracking-tight text-white shadow-md shadow-brand-600/10 transition-all hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Cap tai khoan moi
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Tim kiem</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-md rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-semibold focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500" />
          </div>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <DataTable data={filteredUsers} columns={columns} searchPlaceholder="Loc nhanh danh sach..." searchField="fullName" />
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setCreateOpen(false)} aria-label="Dong" />
          <form onSubmit={handleCreateOrganizer} className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button type="button" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => setCreateOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-lg font-extrabold text-slate-950">Cap tai khoan Ban to chuc</h2>
            <div className="mt-5 grid gap-4">
              <input className="tvu-input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Ho va ten" />
              <input className="tvu-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="organizer@tvu.edu.vn" />
              <select className="tvu-input" value={form.clubId} onChange={(event) => setForm({ ...form, clubId: event.target.value })}>
                {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setCreateOpen(false)}>Huy</button>
              <button type="submit" className="min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">Cap tai khoan</button>
            </div>
          </form>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
