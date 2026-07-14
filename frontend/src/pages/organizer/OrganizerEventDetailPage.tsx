import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Calendar, CheckCircle2, ChevronLeft, MapPin, Ticket, XCircle } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import EventBanner from "../../components/events/EventBanner";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { ticketService } from "../../services/ticketService";
import { getCurrentUser } from "../../state/authSession";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";
import { Ticket as IssuedTicket } from "../../types/ticket";

export default function OrganizerEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const currentUser = getCurrentUser();
  const [event, setEvent] = useState<Event | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadEventData = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    try {
      const [events, pendingReservations, issuedTickets] = await Promise.all([
        eventService.listByClubRemote(currentUser.clubId || ""),
        registrationService.listPendingForOrganizer(),
        ticketService.listAttendees(eventId).catch(() => [] as IssuedTicket[]),
      ]);
      setEvent(events.find((item) => item.id === eventId) || null);
      setReservations(pendingReservations.filter((item) => item.eventId === eventId));
      setTickets(issuedTickets);
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tai chi tiet su kien.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.clubId, eventId]);

  useEffect(() => {
    void loadEventData();
  }, [loadEventData]);

  const stats = useMemo(() => ({
    pending: reservations.filter((item) => item.status === "PENDING").length,
    approved: tickets.length,
    checkedIn: tickets.filter((item) => item.checkInStatus === "CHECKED_IN").length,
    total: reservations.length + tickets.length,
  }), [reservations, tickets]);

  const handleApprove = async (reservationId: string) => {
    setActionId(reservationId);
    try {
      await registrationService.updateStatus(reservationId, "APPROVED");
      setToastMsg("Da duyet dang ky. Backend se cap ve va gui email QR bat dong bo neu cau hinh notification san sang.");
      await loadEventData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the duyet dang ky.");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTargetId) return;
    setActionId(rejectTargetId);
    try {
      await registrationService.updateStatus(rejectTargetId, "REJECTED");
      setToastMsg("Da tu choi dang ky.");
      setRejectTargetId(null);
      await loadEventData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the tu choi dang ky.");
    } finally {
      setActionId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quan ly su kien", path: "/organizer/events" }, { label: "Chi tiet su kien" }]} />
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-500">Dang tai chi tiet su kien...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quan ly su kien", path: "/organizer/events" }, { label: "Chi tiet su kien" }]} />
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-bold text-gray-950">Khong tim thay su kien trong club cua tai khoan hien tai.</p>
          <Link to="/organizer/events" className="mt-3 inline-block text-xs font-bold text-brand-600 hover:underline">
            Quay lai danh sach su kien
          </Link>
        </div>
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quan ly su kien", path: "/organizer/events" }, { label: event.title }]} />

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Link to="/organizer/events" className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-gray-100">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="space-y-0.5">
            <h2 className="text-xl font-black tracking-tight text-gray-950">{event.title}</h2>
            <p className="text-xs font-semibold text-gray-500">{event.clubName} - {event.category}</p>
          </div>
        </div>
        <StatusBadge type="event" status={event.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Tong hien thi</span>
          <span className="mt-1 block text-xl font-black text-gray-900">{stats.total}</span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-500">Cho duyet</span>
          <span className="mt-1 block text-xl font-black text-amber-500">{stats.pending}</span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Ve da cap</span>
          <span className="mt-1 block text-xl font-black text-emerald-600">{stats.approved}</span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-brand-600">Da check-in</span>
          <span className="mt-1 block text-xl font-black text-brand-600">{stats.checkedIn}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-44 w-full" />
            <div className="space-y-4 p-5">
              <h3 className="text-sm font-extrabold text-gray-900">Thong tin co ban</h3>
              <div className="space-y-3">
                <div className="flex gap-2.5 text-xs font-semibold text-gray-600">
                  <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Thoi gian</p>
                    <p className="mt-0.5">{formatDateTime(event.startAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs font-semibold text-gray-600">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dia diem</p>
                    <p className="mt-0.5">{event.location}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs font-semibold text-gray-600">
                  <Ticket className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Suc chua</p>
                    <p className="mt-0.5">Con {event.remainingTickets} / {event.capacity} ve theo availability backend.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-extrabold text-gray-900">Mo ta su kien</h3>
            <p className="text-xs font-semibold leading-relaxed text-gray-600">{event.description || "Chua co mo ta."}</p>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Dang ky cho duyet</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">Backend hien expose danh sach pending theo club; ve da duyet xem trong attendee/ticket list.</p>
            </div>

            {reservations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold text-gray-600">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <th className="py-2.5">Sinh vien</th>
                      <th className="py-2.5">MSSV</th>
                      <th className="py-2.5">Trang thai</th>
                      <th className="py-2.5 text-right">Xu ly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation) => (
                      <tr key={reservation.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3">
                          <p className="font-bold text-gray-950">{reservation.studentName || reservation.email}</p>
                          <p className="text-[10px] font-semibold text-gray-400">{reservation.email}</p>
                        </td>
                        <td className="py-3">
                          <p className="font-mono font-bold text-gray-800">{reservation.mssv || "N/A"}</p>
                        </td>
                        <td className="py-3">
                          <StatusBadge type="reservation" status={reservation.status} />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              disabled={actionId === reservation.id}
                              onClick={() => handleApprove(reservation.id)}
                              className="cursor-pointer rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-bold tracking-tight text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Duyet
                            </button>
                            <button
                              disabled={actionId === reservation.id}
                              onClick={() => setRejectTargetId(reservation.id)}
                              className="cursor-pointer rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold tracking-tight text-white hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              <XCircle className="mr-1 inline h-3.5 w-3.5" /> Tu choi
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-sm font-bold text-gray-400">Khong co dang ky pending cho su kien nay.</div>
            )}
          </div>
        </div>
      </div>

      {rejectTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setRejectTargetId(null)} aria-label="Dong" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="font-display text-lg font-extrabold text-slate-950">Tu choi dang ky</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Backend hien chi nhan thao tac reject, khong co DTO luu ly do tu choi.</p>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600" onClick={() => setRejectTargetId(null)}>Huy</button>
              <button className="min-h-10 rounded-xl bg-rose-600 px-4 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60" disabled={actionId === rejectTargetId} onClick={handleReject}>Tu choi</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
