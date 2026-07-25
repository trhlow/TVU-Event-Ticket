import React, { useEffect, useState } from "react";
import { Calendar, Landmark, ShieldCheck, Ticket, Users } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatisticCard from "../../components/common/StatisticCard";
import BarChartCard from "../../components/charts/BarChartCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import DemoDataBadge from "../../components/common/DemoDataBadge";
import { SchoolWideOverview, statisticsService } from "../../services/statisticsService";
import { clubStatsService } from "../../services/clubStatsService";
import { ClubStatsSummary } from "../../types/clubStats";

const CLUB_STATS_PAGE_SIZE = 100;

export default function SuperAdminStatsPage() {
  const [overview, setOverview] = useState<SchoolWideOverview | null>(null);
  const [clubStats, setClubStats] = useState<ClubStatsSummary[]>([]);
  const [overviewError, setOverviewError] = useState("");
  const [clubStatsError, setClubStatsError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      statisticsService.overview(),
      clubStatsService.listSummaries({ page: 0, size: CLUB_STATS_PAGE_SIZE }),
    ]).then(([overviewResult, clubResult]) => {
      if (!mounted) return;
      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverviewError(
          overviewResult.reason instanceof Error
            ? overviewResult.reason.message
            : "Không thể tải thống kê toàn trường.",
        );
      }
      if (clubResult.status === "fulfilled") {
        setClubStats(clubResult.value.items);
      } else {
        setClubStatsError(
          clubResult.reason instanceof Error
            ? clubResult.reason.message
            : "Không thể tải thống kê theo câu lạc bộ.",
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (overviewError) {
    return (
      <BackendPendingNotice
        title="Không thể tải thống kê toàn trường"
        description={overviewError}
        requiredEndpoints={["GET /admin/stats", "GET /events/stats", "GET /ticketing/stats"]}
      />
    );
  }

  if (!overview) {
    return <LoadingSkeleton type="card" count={5} />;
  }

  const clubStatsData = clubStats.map((club) => ({
    name: club.clubName,
    "Sự kiện": club.totalEvents,
    "Vé phát hành": club.ticketsIssued,
    "Đã check-in": club.checkedIn,
  }));
  const statusData = Object.entries(overview.events.eventsByStatus).map(([status, value]) => ({
    name: status === "DRAFT" ? "Bản nháp" : status === "OPEN" ? "Đang mở" : "Đã đóng",
    value: value ?? 0,
  }));

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <PageHeader
        title="Thống kê toàn trường"
        description="Dữ liệu trực tiếp từ các lát cắt thống kê quản trị, sự kiện và ticketing của backend."
      />

      <div className="flex justify-end">
        <DemoDataBadge />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatisticCard label="Tổng CLB" value={overview.admin.totalClubs} icon={Landmark} />
        <StatisticCard label="Tổng người dùng" value={overview.admin.totalUsers} icon={Users} />
        <StatisticCard label="Tổng sự kiện" value={overview.events.totalEvents} icon={Calendar} color="warning" />
        <StatisticCard label="Vé đã phát hành" value={overview.tickets.ticketsIssued} icon={Ticket} />
        <div className="col-span-2 md:col-span-1">
          <StatisticCard
            label="Tỷ lệ check-in"
            value={
              overview.tickets.checkInRate == null
                ? "Chưa có dữ liệu"
                : `${Math.round(overview.tickets.checkInRate * 100)}%`
            }
            icon={ShieldCheck}
            color="success"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {clubStatsError ? (
            <BackendPendingNotice
              title="Không thể tải thống kê theo CLB"
              description={clubStatsError}
              requiredEndpoints={["GET /admin/clubs/stats"]}
            />
          ) : (
            <BarChartCard
              title="Hoạt động theo câu lạc bộ"
              xAxisKey="name"
              data={clubStatsData}
              dataKeys={[
                { key: "Sự kiện", name: "Số sự kiện", color: "#3b82f6" },
                { key: "Vé phát hành", name: "Vé phát hành", color: "#f59e0b" },
                { key: "Đã check-in", name: "Đã check-in", color: "#10b981" },
              ]}
            />
          )}
        </div>
        <DonutChartCard
          title="Trạng thái sự kiện toàn trường"
          data={statusData}
          colors={["#94a3b8", "#10b981", "#f59e0b"]}
        />
      </div>
    </div>
  );
}
