import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, Calendar, CheckCircle, ClipboardList, Sparkles, Ticket } from "lucide-react";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LineChartCard from "../../components/charts/LineChartCard";
import PageHeader from "../../components/common/PageHeader";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import DataTable from "../../components/common/DataTable";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/common/ToastProvider";
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
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingReservations, setPendingReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setIsLoading(true);
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
    <div className="space-y-7 text-left">
      <PageHeader
        eyebrow="Không gian Ban tổ chức"
        icon={Sparkles}
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
        <LoadingSkeleton type="card" count={5} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} />
          <StatisticCard label="Sự kiện đang mở" value={activeEventsCount} icon={CheckCircle} color="success" />
          <StatisticCard label="Đăng ký chờ duyệt" value={pendingReservations.length} icon={ClipboardList} color="warning" />
          <StatisticCard label="Vé đã phát hành" value={tickets.length} icon={Ticket} color="primary" />
          <StatisticCard label="Đã điểm danh" value={checkedInCount} icon={Award} color="success" />
        </div>
      )}

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
        <div className="pt-4">
          {isLoading ? (
            <LoadingSkeleton type="table" count={5} />
          ) : events.length === 0 ? (
            <EmptyState title="Chưa có sự kiện nào" description="Tạo sự kiện đầu tiên cho CLB để bắt đầu quản lý đăng ký và vé." />
          ) : (
            <DataTable data={events.slice(0, 5)} columns={recentEventColumns} searchPlaceholder="Tìm kiếm sự kiện..." searchField="title" pageSize={5} />
          )}
        </div>
      </section>
    </div>
  );
}
