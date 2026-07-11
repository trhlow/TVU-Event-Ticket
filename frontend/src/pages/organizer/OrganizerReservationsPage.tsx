import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Eye, ShieldCheck, Users, X, XCircle } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { Reservation } from "../../types/reservation";
import { formatDateTime } from "../../utils/formatDate";
import { registrationService } from "../../services/registrationService";

export default function OrganizerReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "APPROVE" | "REJECT" } | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadReservations = async () => {
    setIsLoading(true);
    try {
      setReservations(await registrationService.listRemote());
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach dang ky.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadReservations();
  }, []);

  const filteredReservations = useMemo(() => {
    if (selectedStatus === "ALL") return reservations;
    return reservations.filter((reservation) => reservation.status === selectedStatus);
  }, [reservations, selectedStatus]);

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      await registrationService.updateStatus(pendingAction.id, pendingAction.type === "APPROVE" ? "APPROVED" : "REJECTED");
      setToastMsg(pendingAction.type === "APPROVE" ? "Da duyet dang ky." : "Da tu choi dang ky.");
      setPendingAction(null);
      await loadReservations();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the xu ly dang ky.");
    }
  };

  const columns = [
    {
      header: "Sinh vien",
      accessor: (reservation: Reservation) => (
        <div>
          <p className="font-extrabold text-slate-950">{reservation.studentName || reservation.email}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{reservation.email}</p>
        </div>
      ),
    },
    {
      header: "MSSV",
      accessor: (reservation: Reservation) => <p className="font-mono font-black text-slate-900">{reservation.mssv || "N/A"}</p>,
    },
    { header: "Su kien", accessor: (reservation: Reservation) => <span className="font-bold text-slate-900">{reservation.eventId}</span> },
    { header: "Thoi gian", accessor: (reservation: Reservation) => <span className="text-xs font-bold text-slate-500">{formatDateTime(reservation.createdAt)}</span> },
    { header: "Trang thai", accessor: (reservation: Reservation) => <StatusBadge type="reservation" status={reservation.status} /> },
    {
      header: "Hanh dong",
      className: "text-right",
      accessor: (reservation: Reservation) => (
        <div className="flex justify-end gap-2">
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Xem chi tiet">
            <Eye className="h-4 w-4" />
          </button>
          {reservation.status === "PENDING" && (
            <>
              <button onClick={() => setPendingAction({ id: reservation.id, type: "APPROVE" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700">
                <ShieldCheck className="h-4 w-4" /> Duyet
              </button>
              <button onClick={() => setPendingAction({ id: reservation.id, type: "REJECT" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-700">
                <XCircle className="h-4 w-4" /> Tu choi
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Duyet dang ky su kien" }]} />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="tvu-page-title text-2xl">Duyet dang ky su kien</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Approve moi giu ve va cap ticket theo backend.</p>
        </div>
        <label className="block sm:w-56">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Trang thai</span>
          <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="tvu-input">
            <option value="ALL">Tat ca</option>
            <option value="PENDING">Cho duyet</option>
            <option value="APPROVED">Da duyet</option>
            <option value="REJECTED">Tu choi</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatisticCard label="Tong dang ky" value={filteredReservations.length} icon={Users} />
        <StatisticCard label="Cho duyet" value={filteredReservations.filter((item) => item.status === "PENDING").length} icon={Clock} color="warning" />
        <StatisticCard label="Da duyet" value={filteredReservations.filter((item) => item.status === "APPROVED").length} icon={CheckCircle} color="success" />
        <StatisticCard label="Tu choi" value={filteredReservations.filter((item) => item.status === "REJECTED").length} icon={XCircle} color="danger" />
      </div>

      {isLoading ? <div className="py-10 text-center text-sm font-bold text-slate-500">Dang tai...</div> : <DataTable data={filteredReservations} columns={columns} searchPlaceholder="Tim sinh vien, MSSV, email..." searchField={(row) => `${row.studentName} ${row.mssv} ${row.email}`} />}

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setPendingAction(null)} aria-label="Dong" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => setPendingAction(null)}>
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-lg font-extrabold text-slate-950">{pendingAction.type === "APPROVE" ? "Xac nhan duyet" : "Tu choi dang ky"}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Thao tac nay se goi backend va de backend quyet dinh suc chua, club scope va trang thai hop le.</p>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setPendingAction(null)}>Huy</button>
              <button className={`min-h-10 rounded-xl px-4 text-sm font-extrabold text-white ${pendingAction.type === "APPROVE" ? "bg-emerald-600" : "bg-rose-600"}`} onClick={handleConfirmAction}>
                {pendingAction.type === "APPROVE" ? "Duyet" : "Tu choi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
