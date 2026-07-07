import React, { useMemo } from "react";
import { Award, Calendar, Layers, ShieldCheck, Ticket, Users } from "lucide-react";
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
    <div className="space-y-6 text-left">
      <section>
        <h1 className="font-display text-3xl font-extrabold text-brand-700">Dashboard Overview</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#444653]">
          Giám sát CLB, tài khoản Ban tổ chức, sự kiện toàn trường, vé QR và nhật ký vận hành của hệ thống.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatisticCard label="Tổng CLB" value={mockClubs.length} icon={Layers} />
        <StatisticCard label="Tài khoản Ban tổ chức" value={mockUsers.filter((user) => user.role === "ORGANIZER").length} icon={Users} color="success" />
        <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} color="warning" />
        <StatisticCard label="Sinh viên tham gia" value={reservations.filter((item) => item.status === "APPROVED").length} icon={Award} />
        <StatisticCard label="Vé phát hành" value={tickets.length} icon={Ticket} color="success" />
        <StatisticCard label="Lượt điểm danh" value={checkedIn} icon={ShieldCheck} color="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BarChartCard title="Sự kiện theo CLB" data={clubDistributionData} xAxisKey="name" dataKeys={[{ key: "Số sự kiện", name: "Số sự kiện", color: "#1677d2" }]} />
        <div className="lg:col-span-2">
          <LineChartCard title="Lượt đăng ký theo tháng" data={monthlyData} xAxisKey="name" dataKeys={[{ key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#00a779" }]} />
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
          <h2 className="font-display text-base font-extrabold text-slate-950">Hoạt động gần đây</h2>
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
                  <tr key={log.id}>
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
