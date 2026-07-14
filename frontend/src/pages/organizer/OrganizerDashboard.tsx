import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, Calendar, CheckCircle, ClipboardList, Sparkles, Ticket } from "lucide-react";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";
import { Ticket as IssuedTicket } from "../../types/ticket";

export default function OrganizerDashboard() {
  const currentUser = getCurrentUser();
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
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai dashboard CLB.");
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
    { name: "Da cap", "Luot dang ky": tickets.length, "Da diem danh": checkedInCount },
    { name: "Cho duyet", "Luot dang ky": pendingReservations.length, "Da diem danh": 0 },
  ]), [checkedInCount, pendingReservations.length, tickets.length]);

  const statusData = [
    { name: "Cho duyet", value: pendingReservations.length },
    { name: "Da cap ve", value: tickets.length },
    { name: "Da diem danh", value: checkedInCount },
  ];

  return (
    <div className="space-y-7 text-left">
      <section className="page-hero relative overflow-hidden p-6 text-white md:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-4 w-4" /> Khong gian Ban to chuc
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Tong quan CLB</h1>
            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-white/82">
              Theo doi su kien, duyet dang ky, phat hanh ve QR va tien do check-in cua {currentUser.clubName || "CLB"}.
            </p>
          </div>
          <Link to="/organizer/events/create" className="btn-press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-extrabold text-brand-800 shadow-xl shadow-brand-950/10">
            Tao su kien <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatisticCard label="Tong su kien" value={events.length} icon={Calendar} />
        <StatisticCard label="Su kien dang mo" value={activeEventsCount} icon={CheckCircle} color="success" />
        <StatisticCard label="Dang ky cho duyet" value={pendingReservations.length} icon={ClipboardList} color="warning" />
        <StatisticCard label="Ve da phat hanh" value={tickets.length} icon={Ticket} color="primary" />
        <StatisticCard label="Da diem danh" value={checkedInCount} icon={Award} color="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChartCard
            title="Tong hop dang ky va diem danh"
            data={lineChartData}
            xAxisKey="name"
            dataKeys={[
              { key: "Luot dang ky", name: "Luot dang ky", color: "#2563eb" },
              { key: "Da diem danh", name: "Da diem danh", color: "#00a896" },
            ]}
          />
        </div>
        <DonutChartCard title="Trang thai ticketing" data={statusData} colors={["#f59e0b", "#10b981", "#2563eb"]} />
      </div>

      <section className="enterprise-card p-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="section-heading">Su kien gan day</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Danh sach su kien moi nhat cua CLB</p>
          </div>
          <Link to="/organizer/events" className="inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
            Xem tat ca <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="py-3">Su kien</th>
                <th className="py-3">Thoi gian</th>
                <th className="py-3">Ve con lai</th>
                <th className="py-3">Trang thai</th>
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
          {events.length === 0 && <div className="py-10 text-center text-sm font-bold text-slate-400">Chua co su kien nao.</div>}
        </div>
      </section>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
