import React, { useEffect, useState } from "react";
import { Activity, Calendar, Gauge, Layers, ShieldCheck, Ticket, Users } from "lucide-react";
import BarChartCard from "../../components/charts/BarChartCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import StatisticCard from "../../components/common/StatisticCard";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import type { AuditLog } from "../../types/audit";
import type { ClubStatsSummary } from "../../types/clubStats";
import { formatDateTime } from "../../utils/formatDate";
import { auditLogService } from "../../services/auditLogService";
import { clubStatsService } from "../../services/clubStatsService";
import { SchoolWideOverview, statisticsService } from "../../services/statisticsService";

export default function SuperAdminDashboard() {
  const [overview, setOverview] = useState<SchoolWideOverview | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [clubStats, setClubStats] = useState<ClubStatsSummary[]>([]);
  const [loadError, setLoadError] = useState("");
  const [auditLogError, setAuditLogError] = useState("");
  const [clubStatsError, setClubStatsError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      statisticsService.overview(),
      auditLogService.listRemote({ size: 5 }),
      clubStatsService.listSummaries({ page: 0, size: 100 }),
    ]).then(([overviewResult, logsResult, clubsResult]) => {
      if (!mounted) return;

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setLoadError(
          overviewResult.reason instanceof Error
            ? overviewResult.reason.message
            : "Không thể tải số liệu toàn trường.",
        );
      }

      if (logsResult.status === "fulfilled") {
        setRecentLogs(logsResult.value.items);
      } else {
        setAuditLogError(
          logsResult.reason instanceof Error ? logsResult.reason.message : "Không thể tải nhật ký hoạt động.",
        );
      }

      if (clubsResult.status === "fulfilled") {
        setClubStats(clubsResult.value.items);
      } else {
        setClubStatsError(
          clubsResult.reason instanceof Error ? clubsResult.reason.message : "Không thể tải thống kê theo CLB.",
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (loadError) {
    return (
      <BackendPendingNotice
        title="Không thể tải dashboard toàn trường"
        description={loadError}
      />
    );
  }

  if (!overview) {
    return <LoadingSkeleton type="card" count={5} />;
  }

  const clubDistributionData = clubStats.map((club) => ({
    name: club.clubName,
    "Sự kiện": club.totalEvents,
    "Vé phát hành": club.ticketsIssued,
    "Đã check-in": club.checkedIn,
  }));
  const eventStatusData = Object.entries(overview.events.eventsByStatus).map(([status, value]) => ({
    name: status === "DRAFT" ? "Bản nháp" : status === "OPEN" ? "Đang mở" : "Đã đóng",
    value: value ?? 0,
  }));
  const auditColumns = [
    {
      header: "Người thực hiện",
      accessor: (log: AuditLog) => (
        <span className="block font-extrabold text-slate-950">{log.userName || log.actorName}</span>
      ),
    },
    {
      header: "Hành động",
      accessor: (log: AuditLog) => <span className="font-semibold text-slate-700">{log.action}</span>,
    },
    {
      header: "Thời gian",
      accessor: (log: AuditLog) => (
        <span className="text-xs font-bold text-slate-500">{formatDateTime(log.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-7 text-left">
      <PageHeader
        eyebrow="Trung tâm điều hành hệ thống"
        icon={Activity}
        title="Dashboard toàn trường"
        description="Giám sát dữ liệu CLB, người dùng, sự kiện, vé và check-in theo thời gian thực."
      />

      <div className="flex justify-end">
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatisticCard label="Tổng CLB" value={overview.admin.totalClubs} icon={Layers} />
        <StatisticCard label="Tổng người dùng" value={overview.admin.totalUsers} icon={Users} />
        <StatisticCard label="Tổng sự kiện" value={overview.events.totalEvents} icon={Calendar} color="warning" />
        <StatisticCard label="Vé phát hành" value={overview.tickets.ticketsIssued} icon={Ticket} color="success" />
        <StatisticCard label="Lượt check-in" value={overview.tickets.checkedIn} icon={ShieldCheck} color="success" />
        <StatisticCard
          label="Tỷ lệ check-in"
          value={overview.tickets.checkInRate == null ? "Chưa có dữ liệu" : `${Math.round(overview.tickets.checkInRate * 100)}%`}
          icon={Gauge}
          color="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {clubStatsError ? (
            <BackendPendingNotice
              title="Không thể tải thống kê theo CLB"
              description={clubStatsError}
            />
          ) : (
            <BarChartCard
              title="Hoạt động theo câu lạc bộ"
              data={clubDistributionData}
              xAxisKey="name"
              dataKeys={[
                { key: "Sự kiện", name: "Sự kiện", color: "#2563eb" },
                { key: "Vé phát hành", name: "Vé phát hành", color: "#f59e0b" },
                { key: "Đã check-in", name: "Đã check-in", color: "#10b981" },
              ]}
            />
          )}
        </div>
        <div className="space-y-6">
          <DonutChartCard
            title="Tỷ lệ check-in"
            data={[
              { name: "Đã check-in", value: overview.tickets.checkedIn },
              {
                name: "Chưa check-in",
                value: Math.max(overview.tickets.ticketsIssued - overview.tickets.checkedIn, 0),
              },
            ]}
            colors={["#10b981", "#cbd5e1"]}
          />
          <DonutChartCard
            title="Trạng thái sự kiện toàn trường"
            data={eventStatusData}
            colors={["#94a3b8", "#10b981", "#f59e0b"]}
          />
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="section-heading">Hoạt động gần đây</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Audit log mới nhất của hệ thống</p>
        </div>
        {auditLogError ? (
          <BackendPendingNotice
            title="Không thể tải audit log"
            description={auditLogError}
          />
        ) : (
          <DataTable
            data={recentLogs}
            columns={auditColumns}
            searchPlaceholder="Tìm kiếm hành động..."
            searchField="action"
            pageSize={5}
          />
        )}
      </section>
    </div>
  );
}
