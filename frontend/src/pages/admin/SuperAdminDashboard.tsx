import React, { useMemo } from "react";
import { Award, Calendar, Layers, ShieldCheck, Ticket, Users, Activity } from "lucide-react";
import BarChartCard from "../../components/charts/BarChartCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import StatisticCard from "../../components/common/StatisticCard";
import { mockAuditLogs } from "../../data/mockAuditLogs";
import { mockClubs } from "../../data/mockClubs";
import { getEvents } from "../../data/mockEvents";
import { getReservations } from "../../data/mockReservations";
import { getTickets } from "../../data/mockTickets";
import { mockUsers } from "../../data/mockUsers";
import { formatDateTime } from "../../utils/formatDate";

export default function SuperAdminDashboard() {
  const events = getEvents();
  const reservations = getReservations();
  const tickets = getTickets();

  const clubDistributionData = useMemo(
    () =>
      mockClubs.map((club) => ({
        name: club.code,
        "Số sự kiện": events.filter((event) => event.clubId === club.id).length,
      })),
    [events],
  );

  const monthlyData = [
    { name: "T1", "Lượt đăng ký": 180 },
    { name: "T2", "Lượt đăng ký": 220 },
    { name: "T3", "Lượt đăng ký": 260 },
    { name: "T4", "Lượt đăng ký": 310 },
    { name: "T5", "Lượt đăng ký": 390 },
    { name: "T6", "Lượt đăng ký": 430 },
  ];

  const checkedIn = tickets.filter((ticket) => ticket.checkInStatus === "CHECKED_IN").length;

  return (
    <div className="space-y-7 text-left">
      <section className="page-hero p-6 text-white md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Activity className="h-4 w-4" /> System command center
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">Dashboard toàn trường</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/82">
              Giám sát CLB, tài khoản Ban tổ chức, sự kiện, vé QR và nhật ký vận hành của TVU Event & Ticketing Platform.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-3 text-right backdrop-blur">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">Hệ thống</p>
            <p className="mt-1 text-2xl font-black">Ổn định</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatisticCard label="Tổng CLB" value={mockClubs.length} icon={Layers} />
        <StatisticCard label="Tài khoản Ban tổ chức" value={mockUsers.filter((user) => user.role === "ORGANIZER").length} icon={Users} color="success" />
        <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} color="warning" />
        <StatisticCard label="Sinh viên tham gia" value={reservations.filter((item) => item.status === "APPROVED").length} icon={Award} />
        <StatisticCard label="Vé phát hành" value={tickets.length} icon={Ticket} color="success" />
        <StatisticCard label="Lượt điểm danh" value={checkedIn} icon={ShieldCheck} color="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BarChartCard title="Sự kiện theo CLB" data={clubDistributionData} xAxisKey="name" dataKeys={[{ key: "Số sự kiện", name: "Số sự kiện", color: "#2563eb" }]} />
        <div className="lg:col-span-2">
          <LineChartCard title="Lượt đăng ký theo tháng" data={monthlyData} xAxisKey="name" dataKeys={[{ key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#00a896" }]} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <DonutChartCard
          title="Tỷ lệ điểm danh toàn trường"
          data={[
            { name: "Đã điểm danh", value: checkedIn || 1 },
            { name: "Chưa điểm danh", value: Math.max(tickets.length - checkedIn, 1) },
          ]}
          colors={["#10b981", "#cbd5e1"]}
        />
        <section className="enterprise-card p-5">
          <h2 className="section-heading">Hoạt động gần đây</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Audit log mới nhất từ các vai trò trong hệ thống</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="py-3">Người thực hiện</th>
                  <th className="py-3">Vai trò</th>
                  <th className="py-3">Hành động</th>
                  <th className="py-3 text-right">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockAuditLogs.slice(0, 5).map((log) => (
                  <tr key={log.id} className="transition hover:bg-brand-50/40">
                    <td className="py-4 font-extrabold text-slate-950">{log.userName}</td>
                    <td className="py-4 text-xs font-bold text-slate-500">{log.role}</td>
                    <td className="py-4 font-semibold text-slate-700">{log.action}</td>
                    <td className="py-4 text-right text-xs font-bold text-slate-500">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
