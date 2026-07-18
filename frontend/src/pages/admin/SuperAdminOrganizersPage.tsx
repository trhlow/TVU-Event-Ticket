import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, Plus, Search } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import ConfirmModal from "../../components/common/ConfirmModal";
import Dialog from "../../components/common/Dialog";
import Toast from "../../components/common/Toast";
import { User } from "../../types/user";
import { userService } from "../../services/userService";
import { clubService } from "../../services/clubService";
import { Club } from "../../types/club";

const supportsSecureOrganizerProvisioning = false;

export default function SuperAdminOrganizersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", clubId: "" });
  const [lockTarget, setLockTarget] = useState<User | null>(null);
  const [isLocking, setIsLocking] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [organizers, clubItems] = await Promise.all([userService.listOrganizersRemote(), clubService.listRemote()]);
      setUsers(organizers);
      setClubs(clubItems);
      if (!form.clubId && clubItems[0]) setForm((value) => ({ ...value, clubId: clubItems[0].id }));
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tải tài khoản organizer.");
    }
  }, [form.clubId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLock = async () => {
    if (!lockTarget) return;
    setIsLocking(true);
    try {
      await userService.lockOrganizer(lockTarget.id);
      setToastMsg("Đã khóa tài khoản organizer.");
      setLockTarget(null);
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể khóa tài khoản.");
    } finally {
      setIsLocking(false);
    }
  };

  const handleCreateOrganizer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supportsSecureOrganizerProvisioning) {
      setToastMsg("Backend chưa hỗ trợ mật khẩu tạm thời hoặc link thiết lập mật khẩu cho tài khoản Ban tổ chức.");
      return;
    }
    if (!form.fullName.trim() || !form.email.trim() || !form.clubId) return;
    try {
      await userService.createOrganizer({ email: form.email.trim(), displayName: form.fullName.trim(), clubId: form.clubId });
      setToastMsg("Đã cấp tài khoản Ban tổ chức mới.");
      setCreateOpen(false);
      setForm({ fullName: "", email: "", clubId: clubs[0]?.id || "" });
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tạo organizer.");
    }
  };

  const filteredUsers = useMemo(() => users.filter((user) => {
    const club = clubs.find((item) => item.id === user.clubId);
    const clubName = club ? club.name : "Chưa phân CLB";
    return `${user.fullName} ${user.email} ${clubName}`.toLowerCase().includes(search.toLowerCase());
  }), [users, clubs, search]);

  const columns = [
    {
      header: "Họ và tên / Email",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-gray-950">{user.fullName}</span>
          <span className="mt-0.5 block text-[10px] text-gray-400">{user.email}</span>
        </div>
      ),
    },
    {
      header: "CLB quản lý",
      accessor: (user: User) => <span className="text-xs font-bold text-gray-700">{clubs.find((club) => club.id === user.clubId)?.name || "Chưa phân CLB"}</span>,
    },
    { header: "Trạng thái", accessor: (user: User) => <StatusBadge type="user" status={user.status} /> },
    {
      header: "Thao tác",
      accessor: (user: User) => (
        <div className="flex justify-end gap-1">
          {user.status === "ACTIVE" && (
            <button onClick={() => setLockTarget(user)} className="cursor-pointer rounded-lg border border-gray-100 p-1.5 text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50" title="Khóa tài khoản">
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Quản lý Ban tổ chức" }]}
        title="Quản lý tài khoản Ban tổ chức"
        description="Chỉ tạo tài khoản khi backend hỗ trợ mật khẩu tạm thời hoặc link thiết lập mật khẩu."
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-press flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold tracking-tight text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" aria-hidden="true" /> Cấp tài khoản mới
          </button>
        }
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            Backend `CreateOrganizerRequest` hiện chỉ có email, displayName và clubId; chưa có password, temporaryPassword hoặc invite/reset link.
            Vì vậy frontend không tạo tài khoản Ban tổ chức mới để tránh tài khoản không thể đăng nhập an toàn.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Tìm kiếm</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-md rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-semibold focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500" />
          </div>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <DataTable data={filteredUsers} columns={columns} searchPlaceholder="Lọc nhanh danh sách..." searchField="fullName" />
      </div>

      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Cấp tài khoản Ban tổ chức"
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="btn-press min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setCreateOpen(false)}>Hủy</button>
            <button type="submit" form="create-organizer-form" disabled={!supportsSecureOrganizerProvisioning} className="btn-press min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">Cấp tài khoản</button>
          </>
        }
      >
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold leading-6 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <span>
            Backend chưa có trường mật khẩu tạm thời hoặc link thiết lập mật khẩu. Chức năng tạo tài khoản mới đang bị khóa ở frontend.
          </span>
        </div>
        <form id="create-organizer-form" onSubmit={handleCreateOrganizer} className="mt-5 grid gap-4">
          <input className="tvu-input disabled:bg-slate-50 disabled:text-slate-400" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Họ và tên" disabled={!supportsSecureOrganizerProvisioning} />
          <input className="tvu-input disabled:bg-slate-50 disabled:text-slate-400" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="organizer@tvu.edu.vn" disabled={!supportsSecureOrganizerProvisioning} />
          <select className="tvu-input disabled:bg-slate-50 disabled:text-slate-400" value={form.clubId} onChange={(event) => setForm({ ...form, clubId: event.target.value })} disabled={!supportsSecureOrganizerProvisioning}>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </form>
      </Dialog>

      {lockTarget && (
        <ConfirmModal
          isOpen={!!lockTarget}
          title="Khóa tài khoản Ban tổ chức"
          description={`Tài khoản "${lockTarget.fullName}" sẽ không thể đăng nhập cho đến khi được mở khóa lại. Bạn có chắc muốn khóa?`}
          confirmText={isLocking ? "Đang khóa..." : "Khóa tài khoản"}
          cancelText="Hủy"
          type="danger"
          onConfirm={() => void handleLock()}
          onCancel={() => setLockTarget(null)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
