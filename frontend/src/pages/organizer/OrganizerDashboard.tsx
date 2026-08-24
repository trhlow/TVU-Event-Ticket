import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Award, Calendar, CheckCircle, ClipboardList, ShieldCheck, Ticket } from "lucide-react";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import PageHeader from "../../components/common/PageHeader";
import SectionCard from "../../components/common/SectionCard";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import DataTable from "../../components/common/DataTable";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/useToast";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { dashboardService, ClubDashboard } from "../../services/dashboardService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";

export default function OrganizerDashboard() {
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingReservations, setPendingReservations] = useState<Reservation[]>([]);
  const [clubDashboard, setClubDashboard] = useState<ClubDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      try {
        const [eventData, pendingData, dashboard] = await Promise.all([
          eventService.listByClubRemote(currentUser.clubId || ""),
          registrationService.listPendingForOrganizer(),
          dashboardService.clubDashboard().catch(() => null),
        ]);
        if (!mounted) return;
        setEvents(eventData);
        setPendingReservations(pendingData);
        setClubDashboard(dashboard);
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải dashboard CLB.", "error");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, [currentUser.clubId, showToast]);

  const activeEventsCount = events.filter((event) => event.status === "OPEN").length;
  const approvedCount = clubDashboard?.approved ?? 0;
  const checkedInCount = clubDashboard?.checkedIn ?? 0;
  const pendingCount = clubDashboard?.pending ?? pendingReservations.length;
  const checkInRate = clubDashboard?.checkInRate ?? null;

  // Backend only reports registration counts per day (no check-in-by-day breakdown), so the line
  // chart has just one real series — a declared-but-unfed "Đã điểm danh" key rendered an empty line.
  const lineChartData = useMemo(() => {
    if (clubDashboard?.registrationsByDay?.length) {
      return clubDashboard.registrationsByDay.map((entry) => ({
        name: entry.date,
        "Lượt đăng ký": entry.count,
      }));
    }
    return [
      { name: "Đã cấp", "Lượt đăng ký": approvedCount },
      { name: "Chờ duyệt", "Lượt đăng ký": pendingCount },
    ];
  }, [approvedCount, clubDashboard, pendingCount]);

  // checkedInCount is a subset of approvedCount (a checked-in ticket was already approved), so
  // summing both as separate donut slices double-counts it. Split into non-overlapping buckets.
  const statusData = [
    { name: "Chờ duyệt", value: pendingCount },
    { name: "Đã cấp vé (chưa điểm danh)", value: Math.max(approvedCount - checkedInCount, 0) },
    { name: "Đã điểm danh", value: checkedInCount },
  ];

  const recentEventColumns = [
    {
      header: "Sự kiện",
      accessor: (event: Event) => <span className="font-extrabold text-slate-950">{event.title}</span>,
    },
    {
      header: "Thời gian",
      accessor: (event: Event) => <span className="font-semibold text-slate-500">{formatDateTime(event.startAt)}</span>,
    },
    {
      header: "Vé còn lại",
      accessor: (event: Event) => <span className="font-semibold text-slate-700">{event.remainingTickets}/{event.capacity}</span>,
    },
    {
      header: "Trạng thái",
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
  ];

  return (
    <div className="space-y-section text-left">
      <PageHeader
        title="Tổng quan CLB"
        description={`Theo dõi sự kiện, duyệt đăng ký, phát hành vé QR và tiến độ check-in của ${currentUser.clubName || "CLB"}.`}
        actions={
          <Button asChild>
            <Link to="/organizer/events/create">
              Tạo sự kiện <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingSkeleton type="card" count={6} />
      ) : (
        <div className="grid gap-section sm:grid-cols-2 lg:grid-cols-3">
          <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} />
          <StatisticCard label="Sự kiện đang mở" value={activeEventsCount} icon={CheckCircle} color="success" />
          <StatisticCard label="Đăng ký chờ duyệt" value={pendingCount} icon={ClipboardList} color="warning" />
          <StatisticCard label="Vé đã phát hành" value={approvedCount} icon={Ticket} color="primary" />
          <StatisticCard label="Đã điểm danh" value={checkedInCount} icon={Award} color="success" />
          <StatisticCard
            label="Tỷ lệ check-in"
            value={checkInRate == null ? "Chưa có dữ liệu" : `${Math.round(checkInRate * 100)}%`}
            icon={ShieldCheck}
            color="success"
          />
        </div>
      )}

      <div className="grid gap-section lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <LineChartCard
            title="Tổng hợp đăng ký và điểm danh"
            data={lineChartData}
            xAxisKey="name"
            dataKeys={[
              { key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#2563eb" },
            ]}
          />
        </div>
        <DonutChartCard title="Trạng thái ticketing" data={statusData} colors={["#f59e0b", "#10b981", "#2563eb"]} />
      </div>

      <SectionCard
        title="Sự kiện gần đây"
        description="Danh sách sự kiện mới nhất của CLB"
        action={
          <Link to="/organizer/events" className="inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
            Xem tất cả <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      >
        {isLoading ? (
          <LoadingSkeleton type="table" count={5} />
        ) : events.length === 0 ? (
          <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên cho CLB để bắt đầu quản lý đăng ký và vé." />
        ) : (
          <DataTable data={events.slice(0, 5)} columns={recentEventColumns} searchPlaceholder="Tìm kiếm sự kiện..." searchField="title" pageSize={5} />
        )}
      </SectionCard>
    </div>
  );
}
