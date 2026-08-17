import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, ArrowRight, Award, Calendar, Sparkles, Ticket } from "lucide-react";
import EventCard from "../../components/events/EventCard";
import PageHeader from "../../components/common/PageHeader";
import SectionCard from "../../components/common/SectionCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import { useToast } from "../../hooks/useToast";
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
  const { showToast } = useToast();

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
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải dữ liệu tổng quan.", "error");
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const pendingReservationsCount = reservations.filter((reservation) => reservation.status === "PENDING").length;

  // Reservations already carry their own event title from the backend. Tickets don't, so fall back to
  // the title of the reservation that produced them (same eventId), then to the small featured-events
  // list — never to the "featured" list alone, which only holds up to 3 OPEN events and would show a
  // placeholder for the student's own past or closed-event tickets.
  function eventTitleForTicket(eventId: string): string {
    return (
      reservations.find((item) => item.eventId === eventId)?.eventTitle ||
      events.find((item) => item.id === eventId)?.title ||
      "Sự kiện đang cập nhật thông tin"
    );
  }

  return (
    <div className="space-y-section text-left">
      <PageHeader
        eyebrow="Cổng sinh viên"
        icon={Sparkles}
        title="Tổng quan sự kiện cá nhân"
        description="Khám phá sự kiện CLB, gửi đăng ký tham gia và quản lý vé QR điện tử của bạn tại Trường Đại học Trà Vinh."
        actions={
          <div className="rounded-card border border-info-100 bg-info-50 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">MSSV</p>
            <p className="mt-1 font-mono text-xl font-semibold text-brand-900">{currentUser.mssv || "Chưa cập nhật"}</p>
          </div>
        }
      />

      {!currentUser.profileComplete && (
        <div className="flex flex-col gap-3 rounded-card border border-warning-200 bg-warning-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-warning-950">Yêu cầu hoàn tất hồ sơ</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-warning-800">
                Cập nhật MSSV và lớp học để đủ điều kiện đăng ký tham gia sự kiện.
              </p>
            </div>
          </div>
          <Link to="/student/profile/complete" className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-control bg-warning-600 px-4 text-sm font-medium text-white">
            Cập nhật ngay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {currentUser.profileComplete && currentUser.mssvStatus !== "VERIFIED" && (
        <div className="flex flex-col gap-3 rounded-card border border-warning-200 bg-warning-50 p-4 shadow-sm sm:flex-row sm:items-center">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-warning-950">MSSV đang chờ xác minh</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-warning-800">
              Bạn chưa thể gửi đăng ký sự kiện cho đến khi Ban quản trị xác minh MSSV.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-section sm:grid-cols-2 lg:grid-cols-3">
        <StatisticCard label="Sự kiện đã đăng ký" value={reservations.length} icon={Calendar} subtext="Tính tất cả trạng thái" />
        <StatisticCard label="Vé QR đã cấp" value={tickets.length} icon={Ticket} subtext="Vé điện tử cá nhân" color="success" />
        <StatisticCard label="Đơn chờ duyệt" value={pendingReservationsCount} icon={Award} subtext="Ban tổ chức đang xem xét" color="warning" />
      </div>

      <section className="space-y-section">
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
          <div className="grid gap-section sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="rounded-card border border-slate-100 bg-white p-8 text-center text-sm font-bold text-slate-400">
            Chưa có sự kiện công khai đang mở đăng ký.
          </div>
        )}
      </section>

      <section className="grid gap-section lg:grid-cols-2">
        <SectionCard title="Trạng thái đăng ký gần đây">
          <div className="divide-y divide-slate-100">
            {reservations.slice(0, 4).map((reservation) => (
              <div key={reservation.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{reservation.eventTitle || "Sự kiện đang cập nhật thông tin"}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(reservation.createdAt)}</p>
                </div>
                <StatusBadge type="reservation" status={reservation.status} />
              </div>
            ))}
            {reservations.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Bạn chưa gửi đăng ký nào.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Vé điện tử của tôi">
          <div className="space-y-3">
            {tickets.slice(0, 3).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-card border border-slate-100 bg-slate-50/80 p-3 transition hover:bg-brand-50/60">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{eventTitleForTicket(ticket.eventId)}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-500">Mã vé: {ticket.ticketCode}</p>
                </div>
                <Link to={`/student/tickets/${ticket.id}`} className="btn-press inline-flex h-9 items-center rounded-control bg-brand-600 px-3 text-xs font-medium text-white">
                  Mở vé
                </Link>
              </div>
            ))}
            {tickets.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">Chưa có vé được cấp.</p>}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
