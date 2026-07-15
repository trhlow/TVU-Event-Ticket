import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, Calendar, CheckCircle, ClipboardList, Sparkles, Ticket } from "lucide-react";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
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

export default function OrganizerDashboard() {
  const currentUser = requireCurrentUser();
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingReservations, setPendingReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const eventData = await eventService.listByClubRemote(currentUser.clubId || "");
        const [pendingData, attendeeGroups] = await Promise.all([
          registrationService.listPendingForOrganizer(),
          Promise.all(eventData.map((event) => ticketService.listAttendees(event.id).catch(() => [] as IssuedTicket[]))),
        ]);
        if (!mounted) return;
        setEvents(eventData);
        setPendingReservations(pendingData);
        setTickets(attendeeGroups.flat());
      } catch (error) {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Không thể tải dashboard CLB.");
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [currentUser.clubId]);

  const activeEventsCount = events.filter((event) => event.status === "OPEN").length;
  const checkedInCount = tickets.filter((ticket) => ticket.checkInStatus === "CHECKED_IN").length;

  const lineChartData = useMemo(() => ([
    { name: "Đã cấp", "Lượt đăng ký": tickets.length, "Đã điểm danh": checkedInCount },
    { name: "Chờ duyệt", "Lượt đăng ký": pendingReservations.length, "Đã điểm danh": 0 },
  ]), [checkedInCount, pendingReservations.length, tickets.length]);

  const statusData = [
    { name: "Chờ duyệt", value: pendingReservations.length },
    { name: "Đã cấp vé", value: tickets.length },
    { name: "Đã điểm danh", value: checkedInCount },
  ];

  return (
    <div className="space-y-7 text-left">
      <section className="page-hero relative overflow-hidden p-6 text-white md:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-4 w-4" /> Không gian Ban tổ chức
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Tổng quan CLB</h1>
            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-white/82">
              Theo dõi sự kiện, duyệt đăng ký, phát hành vé QR và tiến độ check-in của {currentUser.clubName || "CLB"}.
            </p>
          </div>
          <Link to="/organizer/events/create" className="btn-press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-extrabold text-brand-800 shadow-xl shadow-brand-950/10">
            Tạo sự kiện <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} />
        <StatisticCard label="Sự kiện đang mở" value={activeEventsCount} icon={CheckCircle} color="success" />
        <StatisticCard label="Đăng ký chờ duyệt" value={pendingReservations.length} icon={ClipboardList} color="warning" />
        <StatisticCard label="Vé đã phát hành" value={tickets.length} icon={Ticket} color="primary" />
        <StatisticCard label="Đã điểm danh" value={checkedInCount} icon={Award} color="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChartCard
            title="Tổng hợp đăng ký và điểm danh"
            data={lineChartData}
            xAxisKey="name"
            dataKeys={[
              { key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#2563eb" },
              { key: "Đã điểm danh", name: "Đã điểm danh", color: "#00a896" },
            ]}
          />
        </div>
        <DonutChartCard title="Trạng thái ticketing" data={statusData} colors={["#f59e0b", "#10b981", "#2563eb"]} />
      </div>

      <section className="enterprise-card p-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="section-heading">Sự kiện gần đây</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Danh sách sự kiện mới nhất của CLB</p>
          </div>
          <Link to="/organizer/events" className="inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
            Xem tất cả <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
                <tr key={event.id} className="transition hover:bg-brand-50/40">
                  <td className="py-4 font-extrabold text-slate-950">{event.title}</td>
                  <td className="py-4 font-semibold text-slate-500">{formatDateTime(event.startAt)}</td>
                  <td className="py-4 font-semibold text-slate-700">{event.remainingTickets}/{event.capacity}</td>
                  <td className="py-4"><StatusBadge type="event" status={event.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && <div className="py-10 text-center text-sm font-bold text-slate-400">Chưa có sự kiện nào.</div>}
        </div>
      </section>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
