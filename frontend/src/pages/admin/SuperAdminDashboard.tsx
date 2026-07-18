import React, { useEffect, useMemo, useState } from "react";
import { Award, Calendar, Layers, ShieldCheck, Ticket, Activity } from "lucide-react";
import BarChartCard from "../../components/charts/BarChartCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import StatisticCard from "../../components/common/StatisticCard";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import DemoDataBadge from "../../components/common/DemoDataBadge";
import { mockAuditLogs } from "../../data/mockAuditLogs";
import type { AuditLog } from "../../types/audit";
import { mockClubs } from "../../data/mockClubs";
import { getEvents } from "../../data/mockEvents";
import { getReservations } from "../../data/mockReservations";
import { getTickets } from "../../data/mockTickets";
import { formatDateTime } from "../../utils/formatDate";
import { apiConfig } from "../../services/apiClient";
import { statisticsService } from "../../services/statisticsService";

const REQUIRED_ENDPOINTS = ["GET /admin/statistics/overview", "GET /admin/audit-logs"];

export default function SuperAdminDashboard() {
  const [available, setAvailable] = useState(apiConfig.useDemoData);

  useEffect(() => {
    statisticsService
      .assertSupported()
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false));
  }, []);

  const events = useMemo(() => getEvents(), []);
  const reservations = useMemo(() => getReservations(), []);
  const tickets = useMemo(() => getTickets(), []);

  const clubDistributionData = useMemo(
    () =>
      mockClubs.map((club) => ({
        name: club.code,
        "Số sự kiện": events.filter((event) => event.clubId === club.id).length,
      })),
    [events],
  );

  const monthlyData = useMemo(() => {
    const counts = new Map<string, number>();
    reservations.forEach((reservation) => {
      const month = new Date(reservation.createdAt).getMonth() + 1;
      const key = `T${month}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([name, value]) => ({ name, "Lượt đăng ký": value })).sort(
      (a, b) => Number(a.name.slice(1)) - Number(b.name.slice(1)),
    );
  }, [reservations]);

  const checkedIn = tickets.filter((ticket) => ticket.checkInStatus === "CHECKED_IN").length;

  const auditColumns = [
    { header: "Người thực hiện", accessor: (log: AuditLog) => <span className="block font-extrabold text-slate-950">{log.userName}</span> },
    { header: "Vai trò", accessor: (log: AuditLog) => <span className="text-xs font-bold text-slate-500">{log.role}</span> },
    { header: "Hành động", accessor: (log: AuditLog) => <span className="font-semibold text-slate-700">{log.action}</span> },
    { header: "Thời gian", accessor: (log: AuditLog) => <span className="text-xs font-bold text-slate-500">{formatDateTime(log.createdAt)}</span> },
  ];

  return (
    <div className="space-y-7 text-left">
      <PageHeader
        eyebrow="Trung tâm điều hành hệ thống"
        icon={Activity}
        title="Dashboard toàn trường"
        description="Giám sát CLB, tài khoản Ban tổ chức, sự kiện, vé QR và nhật ký vận hành của TVU Event & Ticketing Platform."
        actions={
          <div className="rounded-2xl border border-info-100 bg-info-50 px-4 py-3 text-right">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-700">Hệ thống</p>
            <p className="mt-1 text-2xl font-black text-slate-950">Ổn định</p>
          </div>
        }
      />

      {!available ? (
        <BackendPendingNotice
          description="Backend chưa có API thống kê toàn trường và API đọc nhật ký hoạt động. Dashboard sẽ hiển thị số liệu thật ngay khi các endpoint bên dưới sẵn sàng."
          requiredEndpoints={REQUIRED_ENDPOINTS}
        />
      ) : (
        <div className="space-y-7">
          <div className="flex justify-end">
            <DemoDataBadge />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatisticCard label="Tổng CLB" value={mockClubs.length} icon={Layers} />
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
            <section className="space-y-3">
              <div>
                <h2 className="section-heading">Hoạt động gần đây</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Audit log mới nhất từ các vai trò trong hệ thống</p>
              </div>
              <DataTable data={mockAuditLogs} columns={auditColumns} searchPlaceholder="Tìm kiếm hành động..." searchField="action" pageSize={5} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
