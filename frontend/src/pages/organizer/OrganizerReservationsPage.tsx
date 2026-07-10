import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Eye, ShieldCheck, Ticket, Users, X, XCircle } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../data/mockAuth";
import { getEvents, saveEvents } from "../../data/mockEvents";
import { getReservations, saveReservations } from "../../data/mockReservations";
import { getTickets, saveTickets } from "../../data/mockTickets";
import { Reservation } from "../../types/reservation";
import { formatDateTime } from "../../utils/formatDate";

export default function OrganizerReservationsPage() {
  const currentUser = getCurrentUser();
  const events = useMemo(() => getEvents().filter((event) => event.clubId === currentUser.clubId), [currentUser.clubId]);
  const clubEventIds = useMemo(() => events.map((event) => event.id), [events]);
  const [reservations, setReservations] = useState(() => getReservations().filter((reservation) => clubEventIds.includes(reservation.eventId)));
  const [selectedEventId, setSelectedEventId] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "APPROVE" | "REJECT" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const filteredReservations = reservations.filter((reservation) => {
    const matchesEvent = selectedEventId === "ALL" || reservation.eventId === selectedEventId;
    const matchesStatus = selectedStatus === "ALL" || reservation.status === selectedStatus;
    return matchesEvent && matchesStatus;
  });
  const remainingTickets =
    selectedEventId === "ALL"
      ? events.reduce((total, event) => total + event.remainingTickets, 0)
      : events.find((event) => event.id === selectedEventId)?.remainingTickets || 0;

  const getEventTitle = (eventId: string) => events.find((event) => event.id === eventId)?.title || "Sự kiện CLB";
  const getEventRemainingTickets = (eventId: string) => events.find((event) => event.id === eventId)?.remainingTickets || 0;

  const openAction = (id: string, type: "APPROVE" | "REJECT") => {
    setRejectReason("");
    setPendingAction({ id, type });
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;

    const allReservations = getReservations();
    const reservationIndex = allReservations.findIndex((reservation) => reservation.id === pendingAction.id);
    if (reservationIndex === -1) return;

    if (pendingAction.type === "APPROVE") {
      const allEvents = getEvents();
      const eventIndex = allEvents.findIndex((event) => event.id === allReservations[reservationIndex].eventId);
      if (eventIndex === -1 || allEvents[eventIndex].remainingTickets <= 0) {
        setToastMsg("Không thể duyệt vì sự kiện đã hết vé.");
        setPendingAction(null);
        return;
      }

      allReservations[reservationIndex].status = "APPROVED";
      allEvents[eventIndex].remainingTickets = Math.max(allEvents[eventIndex].remainingTickets - 1, 0);
      if (allEvents[eventIndex].remainingTickets === 0) allEvents[eventIndex].status = "FULL";

      const existingTickets = getTickets();
      const existingTicket = existingTickets.find((ticket) => ticket.reservationId === allReservations[reservationIndex].id);
      if (!existingTicket) {
        saveTickets([
          {
            id: `tkt_${Date.now()}`,
            reservationId: allReservations[reservationIndex].id,
            eventId: allReservations[reservationIndex].eventId,
            studentId: allReservations[reservationIndex].studentId,
            ticketCode: `TVU-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
            qrCodeValue: `TVU-${allReservations[reservationIndex].id}`,
            status: "VALID",
            checkInStatus: "PENDING",
            issuedAt: new Date().toISOString(),
          },
          ...existingTickets,
        ]);
      }
      saveEvents(allEvents);
      setToastMsg("Đã duyệt đăng ký và phát hành vé QR điện tử cho sinh viên.");
    } else {
      allReservations[reservationIndex].status = "REJECTED";
      allReservations[reservationIndex].rejectReason = rejectReason.trim() || "Đăng ký chưa đáp ứng điều kiện tham gia sự kiện.";
      setToastMsg("Đã từ chối đăng ký và lưu lý do xử lý.");
    }

    saveReservations(allReservations);
    setReservations(allReservations.filter((reservation) => clubEventIds.includes(reservation.eventId)));
    setPendingAction(null);
  };

  const columns = [
    {
      header: "Họ tên sinh viên",
      accessor: (reservation: Reservation) => (
        <div>
          <p className="font-extrabold text-slate-950">{reservation.studentName}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{reservation.email}</p>
        </div>
      ),
    },
    {
      header: "MSSV / Lớp",
      accessor: (reservation: Reservation) => (
        <div>
          <p className="font-mono font-black text-slate-900">{reservation.mssv}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{reservation.className}</p>
        </div>
      ),
    },
    { header: "Sự kiện", accessor: (reservation: Reservation) => <span className="font-bold text-slate-900">{getEventTitle(reservation.eventId)}</span> },
    { header: "Thời gian đăng ký", accessor: (reservation: Reservation) => <span className="text-xs font-bold text-slate-500">{formatDateTime(reservation.createdAt)}</span> },
    { header: "Trạng thái", accessor: (reservation: Reservation) => <StatusBadge type="reservation" status={reservation.status} /> },
    {
      header: "Hành động",
      className: "text-right",
      accessor: (reservation: Reservation) => (
        <div className="flex justify-end gap-2">
          <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Xem chi tiết">
            <Eye className="h-4 w-4" />
          </button>
          {reservation.status === "PENDING" && (
            <>
              <button
                onClick={() => openAction(reservation.id, "APPROVE")}
                disabled={getEventRemainingTickets(reservation.eventId) <= 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShieldCheck className="h-4 w-4" /> Duyệt
              </button>
              <button
                onClick={() => openAction(reservation.id, "REJECT")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-700"
              >
                <XCircle className="h-4 w-4" /> Từ chối
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban tổ chức", path: "/organizer" }, { label: "Duyệt đăng ký sự kiện" }]} />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="tvu-page-title text-2xl">Duyệt đăng ký sự kiện</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Kiểm tra hồ sơ, duyệt hoặc từ chối đăng ký tham gia của sinh viên.</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Chọn sự kiện</span>
            <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} className="tvu-input">
              <option value="ALL">Tất cả sự kiện</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Trạng thái</span>
            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="tvu-input">
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p>Vé QR chỉ được phát hành sau khi đăng ký được duyệt. Đăng ký ở trạng thái chờ duyệt không làm giảm số vé còn lại.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatisticCard label="Tổng đăng ký" value={filteredReservations.length} icon={Users} />
        <StatisticCard label="Chờ duyệt" value={filteredReservations.filter((item) => item.status === "PENDING").length} icon={Clock} color="warning" />
        <StatisticCard label="Đã duyệt" value={filteredReservations.filter((item) => item.status === "APPROVED").length} icon={CheckCircle} color="success" />
        <StatisticCard label="Từ chối" value={filteredReservations.filter((item) => item.status === "REJECTED").length} icon={XCircle} color="danger" />
        <StatisticCard label="Vé còn lại" value={remainingTickets} icon={Ticket} />
      </div>

      <DataTable data={filteredReservations} columns={columns} searchPlaceholder="Tìm kiếm tên sinh viên, MSSV, email..." searchField={(row) => `${row.studentName} ${row.mssv} ${row.email}`} />

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setPendingAction(null)} aria-label="Đóng" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => setPendingAction(null)}>
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-lg font-extrabold text-slate-950">
              {pendingAction.type === "APPROVE" ? "Xác nhận duyệt đăng ký" : "Từ chối đăng ký"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {pendingAction.type === "APPROVE"
                ? "Sau khi duyệt, hệ thống sẽ tự động cấp một vé QR điện tử cá nhân cho sinh viên."
                : "Vui lòng nhập lý do từ chối để sinh viên có thể theo dõi trạng thái đăng ký."}
            </p>
            {pendingAction.type === "REJECT" && (
              <textarea className="tvu-input mt-4 min-h-28 resize-none" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Nhập lý do từ chối" />
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setPendingAction(null)}>Hủy bỏ</button>
              <button className={`min-h-10 rounded-xl px-4 text-sm font-extrabold text-white ${pendingAction.type === "APPROVE" ? "bg-emerald-600" : "bg-rose-600"}`} onClick={handleConfirmAction}>
                {pendingAction.type === "APPROVE" ? "Duyệt đăng ký" : "Từ chối"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
