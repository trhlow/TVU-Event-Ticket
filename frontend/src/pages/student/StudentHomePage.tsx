import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Award, Calendar, Search, Sparkles, Ticket } from "lucide-react";
import EventCard from "../../components/events/EventCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../data/mockAuth";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";
import { Ticket as IssuedTicket } from "../../types/ticket";

export default function StudentHomePage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [events, setEvents] = useState<Event[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const [eventData, reservationData, ticketData] = await Promise.all([
          eventService.getFeaturedEvents(3),
          registrationService.listByStudentRemote(currentUser.id),
          ticketService.listByStudentRemote(currentUser.id),
        ]);
        if (!mounted) return;
        setEvents(eventData);
        setReservations(reservationData);
        setTickets(ticketData);
      } catch (error) {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai du lieu tong quan.");
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [currentUser.id]);

  const pendingReservationsCount = reservations.filter((reservation) => reservation.status === "PENDING").length;

  function eventTitle(eventId: string): string {
    return events.find((item) => item.id === eventId)?.title || eventId;
  }

  return (
    <div className="space-y-7 text-left">
      <section className="page-hero p-5 text-white md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-4 w-4" /> Cong sinh vien
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">Tong quan su kien ca nhan</h1>
            <p className="mt-3 max-w-3xl text-sm font-normal leading-6 text-white/82">
              Kham pha su kien CLB, gui dang ky tham gia va quan ly ve QR dien tu cua ban tai Truong Dai hoc Tra Vinh.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-4 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">MSSV</p>
            <p className="mt-1 font-mono text-xl font-semibold text-white">{currentUser.mssv || "Chua cap nhat"}</p>
          </div>
        </div>
      </section>

      {!currentUser.profileComplete && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Yeu cau hoan tat ho so</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                Cap nhat MSSV va lop hoc de du dieu kien dang ky tham gia su kien.
              </p>
            </div>
          </div>
          <Link to="/student/profile/complete" className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-medium text-white">
            Cap nhat ngay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatisticCard label="Su kien da dang ky" value={reservations.length} icon={Calendar} subtext="Tinh tat ca trang thai" />
        <StatisticCard label="Ve QR da cap" value={tickets.length} icon={Ticket} subtext="Ve dien tu ca nhan" color="success" />
        <StatisticCard label="Don cho duyet" value={pendingReservationsCount} icon={Award} subtext="Ban to chuc dang xem xet" color="warning" />
      </div>

      <section className="enterprise-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Tim kiem su kien</p>
            <h2 className="section-heading mt-1">Su kien dang mo dang ky</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] md:w-[520px]">
            <label className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="tvu-input pl-10" placeholder="Tim theo ten su kien hoac CLB" />
            </label>
            <select className="tvu-input">
              <option>Tat ca linh vuc</option>
              <option>Hoc thuat</option>
              <option>Ky nang</option>
              <option>Tinh nguyen</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">De xuat cho ban</p>
            <h2 className="section-heading mt-1">Su kien noi bat</h2>
          </div>
          <Link to="/student/events" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            Xem tat ca <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {events.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onViewDetails={(id) => navigate(`/student/events/${id}`)}
                onRegister={(id) => navigate(`/student/events/${id}/register`)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm font-bold text-slate-400">
            Chua co su kien public dang mo dang ky.
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="enterprise-card p-5">
          <h3 className="section-heading">Trang thai dang ky gan day</h3>
          <div className="mt-4 divide-y divide-slate-100">
            {reservations.slice(0, 4).map((reservation) => (
              <div key={reservation.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{eventTitle(reservation.eventId)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(reservation.createdAt)}</p>
                </div>
                <StatusBadge type="reservation" status={reservation.status} />
              </div>
            ))}
            {reservations.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Ban chua gui dang ky nao.</p>}
          </div>
        </div>

        <div className="enterprise-card p-5">
          <h3 className="section-heading">Ve dien tu cua toi</h3>
          <div className="mt-4 space-y-3">
            {tickets.slice(0, 3).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition hover:bg-brand-50/60">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{eventTitle(ticket.eventId)}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-500">Ma ve: {ticket.ticketCode}</p>
                </div>
                <Link to={`/student/tickets/${ticket.id}`} className="btn-press inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white">
                  Mo ve
                </Link>
              </div>
            ))}
            {tickets.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Chua co ve duoc cap.</p>}
          </div>
        </div>
      </section>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
