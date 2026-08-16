import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { Lock, LockOpen, Pencil, Plus } from "lucide-react";
import DataTable from "../../components/common/DataTable";
import ConfirmModal from "../../components/common/ConfirmModal";
import Dialog from "../../components/common/Dialog";
import Toast from "../../components/common/Toast";
import PageHeader from "../../components/common/PageHeader";
import { Club } from "../../types/club";
import { clubService } from "../../services/clubService";

export default function SuperAdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [targetClub, setTargetClub] = useState<Club | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [isCreating, setIsCreating] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [isEditing, setIsEditing] = useState(false);

  const loadClubs = async () => {
    try {
      setClubs(await clubService.listRemote());
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tải danh sách CLB.");
    }
  };

  useEffect(() => {
    void loadClubs();
  }, []);

  const handleConfirmDeactivate = async () => {
    if (!targetClub) return;
    try {
      await clubService.deactivate(targetClub.id);
      setToastMsg(`Đã khóa CLB: ${targetClub.name}`);
      setTargetClub(null);
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể khóa CLB.");
    }
  };

  const handleReactivate = async (club: Club) => {
    setReactivatingId(club.id);
    try {
      await clubService.reactivate(club.id);
      setToastMsg(`Đã mở khóa CLB: ${club.name}`);
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể mở khóa CLB.");
    } finally {
      setReactivatingId(null);
    }
  };

  const openEdit = (club: Club) => {
    setEditingClub(club);
    setEditForm({ name: club.name, description: club.description });
  };

  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingClub || !editForm.name.trim() || isEditing) return;
    setIsEditing(true);
    try {
      await clubService.update(editingClub.id, { name: editForm.name.trim(), description: editForm.description.trim() || undefined });
      setEditingClub(null);
      setToastMsg("Đã cập nhật thông tin CLB.");
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể cập nhật CLB.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await clubService.create({ name: form.name.trim(), description: form.description.trim() || undefined });
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      setToastMsg("Đã tạo CLB mới.");
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tạo CLB.");
    } finally {
      setIsCreating(false);
    }
  };

  const columns = [
    { header: "Mã", accessor: (club: Club) => <span className="block font-mono font-black text-slate-950">{club.code}</span> },
    {
      header: "Tên CLB",
      accessor: (club: Club) => (
        <Link to={`/admin/clubs/${club.id}`} className="block text-left font-semibold hover:underline">
          <span className="block font-bold text-slate-950">{club.name}</span>
          <span className="mt-1 block max-w-sm line-clamp-1 text-[10px] font-semibold text-slate-400">{club.description}</span>
        </Link>
      ),
    },
    {
      header: "Trạng thái",
      accessor: (club: Club) => (
        <span className={`rounded-chip border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${club.status === "ACTIVE" ? "border-success-200 bg-success-50 text-success-700" : "border-danger-200 bg-danger-50 text-danger-700"}`}>
          {club.status}
        </span>
      ),
    },
    {
      header: "Thao tác",
      accessor: (club: Club) => (
        <div className="flex justify-end gap-1.5">
          <button
            onClick={() => openEdit(club)}
            className="btn-press flex cursor-pointer items-center gap-1 rounded-control border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Sửa
          </button>
          {club.status === "ACTIVE" ? (
            <button onClick={() => setTargetClub(club)} className="btn-press flex cursor-pointer items-center gap-1 rounded-control border border-danger-200/60 bg-danger-50 px-2.5 py-1.5 text-[10px] font-black text-danger-700 transition-colors hover:bg-danger-100">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Khóa CLB
            </button>
          ) : (
            <button
              onClick={() => handleReactivate(club)}
              disabled={reactivatingId === club.id}
              className="btn-press flex cursor-pointer items-center gap-1 rounded-control border border-success-200/60 bg-success-50 px-2.5 py-1.5 text-[10px] font-black text-success-700 transition-colors hover:bg-success-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> {reactivatingId === club.id ? "Đang mở..." : "Mở khóa"}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Danh sách câu lạc bộ"
        description="Quản lý danh sách câu lạc bộ trực thuộc trường."
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">
            <Plus className="h-4 w-4" aria-hidden="true" /> Thêm CLB
          </button>
        }
      />

      <div className="enterprise-card p-5">
        <DataTable data={clubs} columns={columns} searchPlaceholder="Tìm kiếm tên câu lạc bộ..." searchField="name" />
      </div>

      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo CLB"
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" disabled={isCreating} className="btn-press min-h-10 rounded-control border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setCreateOpen(false)}>Hủy</button>
            <button type="submit" form="create-club-form" disabled={isCreating} className="btn-press min-h-10 rounded-control bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? "Đang tạo..." : "Tạo CLB"}</button>
          </>
        }
      >
        <form id="create-club-form" onSubmit={handleCreate} className="grid gap-4">
          <input className="tvu-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tên CLB" />
          <textarea className="tvu-input min-h-24" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mô tả" />
        </form>
      </Dialog>

      <Dialog
        isOpen={!!editingClub}
        onClose={() => setEditingClub(null)}
        title="Sửa thông tin CLB"
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" disabled={isEditing} className="btn-press min-h-10 rounded-control border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setEditingClub(null)}>Hủy</button>
            <button type="submit" form="edit-club-form" disabled={isEditing} className="btn-press min-h-10 rounded-control bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">{isEditing ? "Đang lưu..." : "Lưu thay đổi"}</button>
          </>
        }
      >
        <form id="edit-club-form" onSubmit={handleEdit} className="grid gap-4">
          <input className="tvu-input" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} placeholder="Tên CLB" />
          <textarea className="tvu-input min-h-24" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} placeholder="Mô tả" />
        </form>
      </Dialog>

      {targetClub && (
        <ConfirmModal isOpen={!!targetClub} title="Xác nhận khóa CLB" message={`Khóa CLB "${targetClub.name}"? Bạn có thể mở khóa lại CLB này bất kỳ lúc nào sau đó.`} onConfirm={handleConfirmDeactivate} onCancel={() => setTargetClub(null)} confirmText="Khóa CLB" cancelText="Hủy" type="danger" />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
