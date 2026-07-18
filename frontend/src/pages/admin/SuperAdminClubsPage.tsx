import React, { useEffect, useState } from "react";
import { Lock, Plus } from "lucide-react";
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
        <div className="text-left font-semibold">
          <span className="block font-bold text-slate-950">{club.name}</span>
          <span className="mt-1 block max-w-sm line-clamp-1 text-[10px] font-semibold text-slate-400">{club.description}</span>
        </div>
      ),
    },
    {
      header: "Trạng thái",
      accessor: (club: Club) => (
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${club.status === "ACTIVE" ? "border-success-200 bg-success-50 text-success-700" : "border-danger-200 bg-danger-50 text-danger-700"}`}>
          {club.status}
        </span>
      ),
    },
    {
      header: "Thao tác",
      accessor: (club: Club) => (
        <div className="flex justify-end gap-1.5">
          {club.status === "ACTIVE" && (
            <button onClick={() => setTargetClub(club)} className="btn-press flex cursor-pointer items-center gap-1 rounded-xl border border-danger-200/60 bg-danger-50 px-2.5 py-1.5 text-[10px] font-black text-danger-700 transition-colors hover:bg-danger-100">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Khóa CLB
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Quản lý câu lạc bộ" }]}
        title="Danh sách câu lạc bộ"
        description="Quản lý CLB qua backend Auth/Admin service."
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">
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
            <button type="button" disabled={isCreating} className="btn-press min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setCreateOpen(false)}>Hủy</button>
            <button type="submit" form="create-club-form" disabled={isCreating} className="btn-press min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? "Đang tạo..." : "Tạo CLB"}</button>
          </>
        }
      >
        <form id="create-club-form" onSubmit={handleCreate} className="grid gap-4">
          <input className="tvu-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tên CLB" />
          <textarea className="tvu-input min-h-24" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mô tả" />
        </form>
      </Dialog>

      {targetClub && (
        <ConfirmModal isOpen={!!targetClub} title="Xác nhận khóa CLB" message={`Khóa CLB "${targetClub.name}"? Backend hiện chỉ hỗ trợ khóa (deactivate), chưa có API mở khóa.`} onConfirm={handleConfirmDeactivate} onCancel={() => setTargetClub(null)} confirmText="Khóa CLB" cancelText="Hủy" type="danger" />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
