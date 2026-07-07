import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, Calendar, CheckCircle, ClipboardList, Ticket } from "lucide-react";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import { getCurrentUser } from "../../data/mockAuth";
import { getEvents } from "../../data/mockEvents";
import { getReservations } from "../../data/mockReservations";
import { getTickets } from "../../data/mockTickets";
import { formatDateTime } from "../../utils/formatDate";

export default function OrganizerDashboard() {
  const currentUser = getCurrentUser();
  const events = getEvents().filter((event) => event.clubId === currentUser.clubId);
  const eventIds = useMemo(() => events.map((event) => event.id), [events]);
  const reservations = getReservations().filter((reservation) => eventIds.includes(reservation.eventId));
  const tickets = getTickets().filter((ticket) => eventIds.includes(ticket.eventId));

  const activeEventsCount = events.filter((event) => event.status === "OPEN").length;
  const pendingCount = reservations.filter((reservation) => reservation.status === "PENDING").length;
  const checkedInCount = tickets.filter((ticket) => ticket.checkInStatus === "CHECKED_IN").length;

  const lineChartData = [
    { name: "01/07", "Lượt đăng ký": 18, "Đã điểm danh": 8 },
    { name: "02/07", "Lượt đăng ký": 30, "Đã điểm danh": 14 },
    { name: "03/07", "Lượt đăng ký": 26, "Đã điểm danh": 19 },
    { name: "04/07", "Lượt đăng ký": 42, "Đã điểm danh": 27 },
    { name: "Hôm nay", "Lượt đăng ký": 48, "Đã điểm danh": 34 },
  ];

  const statusData = [
    { name: "Chờ duyệt", value: pendingCount || 1 },
    { name: "Đã duyệt", value: reservations.filter((item) => item.status === "APPROVED").length || 1 },
    { name: "Từ chối", value: reservations.filter((item) => item.status === "REJECTED").length || 1 },
  ];

  return (
    <div className="space-y-6 text-left">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-5xl font-extrabold text-[#1A1B22]">Tổng quan</h1>
          <p className="mt-3 text-base font-medium text-[#444653]">Theo dõi hoạt động và tiến độ sự kiện của CLB.</p>
        </div>
        <Link to="/organizer/events/create" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-extrabold text-white">
          Tạo sự kiện <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <div className="grid gap-4 md:grid-cols-5">
        <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} />
        <StatisticCard label="Sự kiện đang mở" value={activeEventsCount} icon={CheckCircle} color="success" />
        <StatisticCard label="Đăng ký chờ duyệt" value={pendingCount} icon={ClipboardList} color="warning" />
        <StatisticCard label="Vé đã phát hành" value={tickets.length} icon={Ticket} color="primary" />
        <StatisticCard label="Đã điểm danh" value={checkedInCount} icon={Award} color="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChartCard
            title="Lượt đăng ký theo thời gian"
            data={lineChartData}
            xAxisKey="name"
            dataKeys={[
              { key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#1677d2" },
              { key: "Đã điểm danh", name: "Đã điểm danh", color: "#00a779" },
            ]}
          />
        </div>
        <DonutChartCard title="Trạng thái đăng ký" data={statusData} colors={["#f59e0b", "#10b981", "#ef4444"]} />
      </div>

      <section className="enterprise-card p-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-slate-950">Sự kiện gần đây</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Danh sách sự kiện mới nhất của CLB</p>
          </div>
          <Link to="/organizer/events" className="inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
            Xem tất cả <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="py-3">Sự kiện</th>
                <th className="py-3">Thời gian</th>
                <th className="py-3">Vé còn lại</th>
                <th className="py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.slice(0, 5).map((event) => (
                <tr key={event.id}>
                  <td className="py-4 font-extrabold text-slate-950">{event.title}</td>
                  <td className="py-4 font-semibold text-slate-500">{formatDateTime(event.startAt)}</td>
                  <td className="py-4 font-semibold text-slate-700">{event.remainingTickets}/{event.capacity}</td>
                  <td className="py-4"><StatusBadge type="event" status={event.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
