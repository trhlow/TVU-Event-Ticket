import React, { useEffect, useState } from "react";
import { Lock, Plus } from "lucide-react";
import DataTable from "../../components/common/DataTable";
import ConfirmModal from "../../components/common/ConfirmModal";
import Toast from "../../components/common/Toast";
import Breadcrumb from "../../components/common/Breadcrumb";
import { Club } from "../../types/club";
import { clubService } from "../../services/clubService";

export default function SuperAdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [targetClub, setTargetClub] = useState<Club | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const loadClubs = async () => {
    try {
      setClubs(await clubService.listRemote());
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach CLB.");
    }
  };

  useEffect(() => {
    void loadClubs();
  }, []);

  const handleConfirmDeactivate = async () => {
    if (!targetClub) return;
    try {
      await clubService.deactivate(targetClub.id);
      setToastMsg(`Da khoa CLB: ${targetClub.name}`);
      setTargetClub(null);
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the khoa CLB.");
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    try {
      await clubService.create({ name: form.name.trim(), description: form.description.trim() || undefined });
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      setToastMsg("Da tao CLB moi.");
      await loadClubs();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tao CLB.");
    }
  };

  const columns = [
    { header: "Ma", accessor: (club: Club) => <span className="block font-mono font-black text-gray-950">{club.code}</span> },
    {
      header: "Ten CLB",
      accessor: (club: Club) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-gray-950">{club.name}</span>
          <span className="mt-1 block max-w-sm line-clamp-1 text-[10px] font-semibold text-gray-400">{club.description}</span>
        </div>
      ),
    },
    {
      header: "Trang thai",
      accessor: (club: Club) => (
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${club.status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {club.status}
        </span>
      ),
    },
    {
      header: "Thao tac",
      accessor: (club: Club) => (
        <div className="flex justify-end gap-1.5">
          {club.status === "ACTIVE" && (
            <button onClick={() => setTargetClub(club)} className="flex cursor-pointer items-center gap-1 rounded-xl border border-rose-200/60 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black text-rose-700 transition-colors hover:bg-rose-100">
              <Lock className="h-3.5 w-3.5" /> Khoa CLB
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Quan tri he thong", path: "/admin" }, { label: "Quan ly cau lac bo" }]} />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-gray-950">Danh sach cau lac bo</h2>
          <p className="text-xs font-semibold text-gray-500">Quan ly CLB qua backend Auth/Admin service.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">
          <Plus className="h-4 w-4" /> Them CLB
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <DataTable data={clubs} columns={columns} searchPlaceholder="Tim kiem ten cau lac bo..." searchField="name" />
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setCreateOpen(false)} aria-label="Dong" />
          <form onSubmit={handleCreate} className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="font-display text-lg font-extrabold text-slate-950">Tao CLB</h2>
            <div className="mt-5 grid gap-4">
              <input className="tvu-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ten CLB" />
              <textarea className="tvu-input min-h-24" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mo ta" />
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setCreateOpen(false)}>Huy</button>
              <button type="submit" className="min-h-10 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800">Tao CLB</button>
            </div>
          </form>
        </div>
      )}

      {targetClub && (
        <ConfirmModal isOpen={!!targetClub} title="Xac nhan khoa CLB" message={`Khoa CLB "${targetClub.name}"? Backend hien ho tro deactivate, chua co API mo khoa.`} onConfirm={handleConfirmDeactivate} onCancel={() => setTargetClub(null)} confirmText="Khoa CLB" cancelText="Huy" type="danger" />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
