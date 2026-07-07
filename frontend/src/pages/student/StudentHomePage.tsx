import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Award, Calendar, Search, Ticket } from "lucide-react";
import EventCard from "../../components/events/EventCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import { getCurrentUser } from "../../data/mockAuth";
import { mockEvents } from "../../data/mockEvents";
import { mockReservations } from "../../data/mockReservations";
import { mockTickets } from "../../data/mockTickets";
import { formatDateTime } from "../../utils/formatDate";

export default function StudentHomePage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const myReservations = mockReservations.filter((reservation) => reservation.studentId === currentUser.id);
  const myTickets = mockTickets.filter((ticket) => ticket.studentId === currentUser.id);
  const pendingReservationsCount = myReservations.filter((reservation) => reservation.status === "PENDING").length;
  const openEvents = mockEvents.filter((event) => event.status === "OPEN").slice(0, 3);

  return (
    <div className="space-y-6 text-left">
      <section className="enterprise-card p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#444653]">Chúc bạn một ngày học tập hiệu quả!</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold text-[#1A1B22]">Xin chào, {currentUser.fullName}</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[#444653]">
              Khám phá sự kiện CLB, gửi đăng ký tham gia và quản lý vé QR điện tử của bạn tại Trường Đại học Trà Vinh.
            </p>
          </div>
          <div className="rounded-xl border border-[#E3E1EB] bg-[#F4F2FC] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#757684]">MSSV</p>
            <p className="mt-1 font-mono text-lg font-black text-brand-700">{currentUser.mssv || "Chưa cập nhật"}</p>
          </div>
        </div>
      </section>

      {!currentUser.profileComplete && (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-extrabold text-amber-950">Yêu cầu hoàn tất hồ sơ</h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                Cập nhật MSSV và lớp học để đủ điều kiện đăng ký tham gia sự kiện.
              </p>
            </div>
          </div>
          <Link to="/student/profile/complete" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white">
            Cập nhật ngay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatisticCard label="Sự kiện đã đăng ký" value={myReservations.length} icon={Calendar} subtext="Tính tất cả trạng thái" />
        <StatisticCard label="Vé QR đã cấp" value={myTickets.length} icon={Ticket} subtext="Vé điện tử cá nhân" color="success" />
        <StatisticCard label="Đơn chờ duyệt" value={pendingReservationsCount} icon={Award} subtext="Ban tổ chức đang xem xét" color="warning" />
      </div>

      <section className="enterprise-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Tìm kiếm sự kiện</p>
            <h2 className="mt-1 font-display text-lg font-extrabold text-slate-950">Sự kiện đang mở đăng ký</h2>
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
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Đề xuất cho bạn</p>
            <h2 className="mt-1 font-display text-lg font-extrabold text-slate-950">Sự kiện nổi bật</h2>
          </div>
          <Link to="/student/events" className="inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
            Xem tất cả <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {openEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onViewDetails={(id) => navigate(`/student/events/${id}`)}
              onRegister={(id) => navigate(`/student/events/${id}/register`)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="enterprise-card p-5">
          <h3 className="font-display text-base font-extrabold text-slate-950">Trạng thái đăng ký gần đây</h3>
          <div className="mt-4 divide-y divide-slate-100">
            {myReservations.slice(0, 4).map((reservation) => {
              const event = mockEvents.find((item) => item.id === reservation.eventId);
              return (
                <div key={reservation.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">{event?.title || "Sự kiện"}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(reservation.createdAt)}</p>
                  </div>
                  <StatusBadge type="reservation" status={reservation.status} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="enterprise-card p-5">
          <h3 className="font-display text-base font-extrabold text-slate-950">Vé điện tử của tôi</h3>
          <div className="mt-4 space-y-3">
            {myTickets.slice(0, 3).map((ticket) => {
              const event = mockEvents.find((item) => item.id === ticket.eventId);
              return (
                <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">{event?.title || "Sự kiện"}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-slate-500">Mã vé: {ticket.ticketCode}</p>
                  </div>
                  <Link to={`/student/tickets/${ticket.id}`} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-extrabold text-white">
                    Mở vé
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
