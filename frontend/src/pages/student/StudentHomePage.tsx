import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Award, Calendar, Search, Sparkles, Ticket } from "lucide-react";
import EventCard from "../../components/events/EventCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";
import { Ticket as IssuedTicket } from "../../types/ticket";

export default function StudentHomePage() {
  const navigate = useNavigate();
  const currentUser = requireCurrentUser();
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
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Không thể tải dữ liệu tổng quan.");
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [currentUser.id]);

  const pendingReservationsCount = reservations.filter((reservation) => reservation.status === "PENDING").length;

  function eventTitle(eventId: string): string {
    return events.find((item) => item.id === eventId)?.title || "Sự kiện đang cập nhật thông tin";
  }

  return (
    <div className="space-y-7 text-left">
      <section className="page-hero p-5 text-white md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-4 w-4" /> Cổng sinh viên
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">Tổng quan sự kiện cá nhân</h1>
            <p className="mt-3 max-w-3xl text-sm font-normal leading-6 text-white/82">
              Khám phá sự kiện CLB, gửi đăng ký tham gia và quản lý vé QR điện tử của bạn tại Trường Đại học Trà Vinh.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-4 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">MSSV</p>
            <p className="mt-1 font-mono text-xl font-semibold text-white">{currentUser.mssv || "Chưa cập nhật"}</p>
          </div>
        </div>
      </section>

      {!currentUser.profileComplete && (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Yêu cầu hoàn tất hồ sơ</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                Cập nhật MSSV và lớp học để đủ điều kiện đăng ký tham gia sự kiện.
              </p>
            </div>
          </div>
          <Link to="/student/profile/complete" className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-warning-600 px-4 text-sm font-medium text-white">
            Cập nhật ngay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatisticCard label="Sự kiện đã đăng ký" value={reservations.length} icon={Calendar} subtext="Tính tất cả trạng thái" />
        <StatisticCard label="Vé QR đã cấp" value={tickets.length} icon={Ticket} subtext="Vé điện tử cá nhân" color="success" />
        <StatisticCard label="Đơn chờ duyệt" value={pendingReservationsCount} icon={Award} subtext="Ban tổ chức đang xem xét" color="warning" />
      </div>

      <section className="enterprise-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Tìm kiếm sự kiện</p>
            <h2 className="section-heading mt-1">Sự kiện đang mở đăng ký</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] md:w-[520px]">
            <label className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="tvu-input pl-10" placeholder="Tìm theo tên sự kiện hoặc CLB" />
            </label>
            <select className="tvu-input">
              <option>Tất cả lĩnh vực</option>
              <option>Học thuật</option>
              <option>Kỹ năng</option>
              <option>Tình nguyện</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Đề xuất cho bạn</p>
            <h2 className="section-heading mt-1">Sự kiện nổi bật</h2>
          </div>
          <Link to="/student/events" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            Xem tất cả <ArrowRight className="h-4 w-4" />
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
            Chưa có sự kiện công khai đang mở đăng ký.
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="enterprise-card p-5">
          <h3 className="section-heading">Trạng thái đăng ký gần đây</h3>
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
            {reservations.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Bạn chưa gửi đăng ký nào.</p>}
          </div>
        </div>

        <div className="enterprise-card p-5">
          <h3 className="section-heading">Vé điện tử của tôi</h3>
          <div className="mt-4 space-y-3">
            {tickets.slice(0, 3).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition hover:bg-brand-50/60">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{eventTitle(ticket.eventId)}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-500">Mã vé: {ticket.ticketCode}</p>
                </div>
                <Link to={`/student/tickets/${ticket.id}`} className="btn-press inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white">
                  Mở vé
                </Link>
              </div>
            ))}
            {tickets.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Chưa có vé được cấp.</p>}
          </div>
        </div>
      </section>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
