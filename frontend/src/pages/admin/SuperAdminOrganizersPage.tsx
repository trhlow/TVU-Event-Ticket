import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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

export default function SuperAdminOrganizersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", clubId: "" });
  const [lockTarget, setLockTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [organizers, clubItems] = await Promise.all([
        userService.listOrganizersRemote(),
        clubService.listRemote(),
      ]);
      setUsers(organizers);
      setClubs(clubItems);
      setForm((value) => ({ ...value, clubId: value.clubId || clubItems[0]?.id || "" }));
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tải tài khoản Ban tổ chức.");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateOrganizer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.clubId) return;
    setIsSaving(true);
    try {
      await userService.createOrganizer({
        email: form.email.trim(),
        displayName: form.fullName.trim(),
        clubId: form.clubId,
      });
      setToastMsg("Đã cấp tài khoản Ban tổ chức mới.");
      setCreateOpen(false);
      setForm({ fullName: "", email: "", clubId: clubs[0]?.id || "" });
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tạo tài khoản Ban tổ chức.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLock = async () => {
    if (!lockTarget) return;
    setIsSaving(true);
    try {
      await userService.lockOrganizer(lockTarget.id);
      setToastMsg("Đã khóa tài khoản Ban tổ chức.");
      setLockTarget(null);
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể khóa tài khoản.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await userService.deleteOrganizer(deleteTarget.id);
      setToastMsg("Đã xóa tài khoản Ban tổ chức.");
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể xóa tài khoản.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const clubName = clubs.find((item) => item.id === user.clubId)?.name || "Chưa phân CLB";
        return `${user.fullName} ${user.email} ${clubName}`.toLowerCase().includes(search.toLowerCase());
      }),
    [users, clubs, search],
  );

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
      accessor: (user: User) => (
        <span className="text-xs font-bold text-gray-700">
          {clubs.find((club) => club.id === user.clubId)?.name || "Chưa phân CLB"}
        </span>
      ),
    },
    { header: "Trạng thái", accessor: (user: User) => <StatusBadge type="user" status={user.status} /> },
    {
      header: "Thao tác",
      accessor: (user: User) => (
        <div className="flex justify-end gap-1">
          {user.status === "ACTIVE" && (
            <button
              onClick={() => setLockTarget(user)}
              className="rounded-lg border border-gray-100 p-1.5 text-rose-600 hover:border-rose-200 hover:bg-rose-50"
              title="Khóa tài khoản"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setDeleteTarget(user)}
            className="rounded-lg border border-gray-100 p-1.5 text-rose-600 hover:border-rose-200 hover:bg-rose-50"
            title="Xóa tài khoản"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Quản lý tài khoản Ban tổ chức"
        description="Cấp tài khoản theo CLB. Người dùng đăng nhập bằng mã OTP gửi tới email đã được cấp."
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-press flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Cấp tài khoản mới
          </button>
        }
      />

      <div className="flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        Tài khoản Ban tổ chức không dùng mật khẩu. Mã đăng nhập một lần được gửi tới email đã đăng ký.
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Tìm kiếm</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full max-w-md rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-semibold"
              placeholder="Tên, email hoặc câu lạc bộ"
            />
          </div>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <DataTable
          data={filteredUsers}
          columns={columns}
          searchPlaceholder="Lọc nhanh danh sách..."
          searchField="fullName"
        />
      </div>

      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Cấp tài khoản Ban tổ chức"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              className="btn-press min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"
              onClick={() => setCreateOpen(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="create-organizer-form"
              disabled={isSaving}
              className="btn-press min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {isSaving ? "Đang cấp..." : "Cấp tài khoản"}
            </button>
          </>
        }
      >
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold leading-6 text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          Người dùng sẽ nhận mã OTP qua email khi đăng nhập, không cần mật khẩu tạm thời.
        </div>
        <form id="create-organizer-form" onSubmit={handleCreateOrganizer} className="mt-5 grid gap-4">
          <input
            className="tvu-input"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            placeholder="Họ và tên"
            required
          />
          <input
            className="tvu-input"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="organizer@tvu.edu.vn"
            required
          />
          <select
            className="tvu-input"
            value={form.clubId}
            onChange={(event) => setForm({ ...form, clubId: event.target.value })}
            required
          >
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </form>
      </Dialog>

      {lockTarget && (
        <ConfirmModal
          isOpen
          title="Khóa tài khoản Ban tổ chức"
          description={`Tài khoản "${lockTarget.fullName}" sẽ không thể đăng nhập. Bạn có chắc muốn khóa?`}
          confirmText={isSaving ? "Đang khóa..." : "Khóa tài khoản"}
          cancelText="Hủy"
          type="danger"
          onConfirm={() => void handleLock()}
          onCancel={() => setLockTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          isOpen
          title="Xóa tài khoản Ban tổ chức"
          description={`Xóa tài khoản "${deleteTarget.fullName}"? Thao tác có thể bị backend từ chối nếu tài khoản đang được tham chiếu.`}
          confirmText={isSaving ? "Đang xóa..." : "Xóa tài khoản"}
          cancelText="Hủy"
          type="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
