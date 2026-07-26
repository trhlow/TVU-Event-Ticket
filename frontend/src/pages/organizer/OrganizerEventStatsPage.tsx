import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { CheckCircle2, Gauge, Ticket, Users } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import StatisticCard from "../../components/common/StatisticCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import { Button } from "../../components/ui/button";
import { dashboardService, EventDashboard } from "../../services/dashboardService";
import { eventService } from "../../services/eventService";
import { requireCurrentUser } from "../../state/authSession";
import { Event } from "../../types/event";

export default function OrganizerEventStatsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const currentUser = requireCurrentUser();
  const [event, setEvent] = useState<Event | undefined>();
  const [dashboard, setDashboard] = useState<EventDashboard | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    // GET /events/{id} only serves OPEN events (public discovery route); DRAFT/CLOSED events an
    // organizer owns 404 there. /events/mine returns every status for the caller's own club.
    Promise.all([eventService.listByClubRemote(currentUser.clubId || ""), dashboardService.eventDashboard(eventId)])
      .then(([events, dashboardResult]) => {
        if (!mounted) return;
        setEvent(events.find((item) => item.id === eventId));
        setDashboard(dashboardResult);
      })
      .catch((error) => {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "Không thể tải thống kê sự kiện.");
        }
      });
    return () => {
      mounted = false;
    };
  }, [eventId, currentUser.clubId]);

  if (loadError) {
    return (
      <BackendPendingNotice
        title="Không thể tải thống kê sự kiện"
        description={loadError}
        requiredEndpoints={["GET /ticketing/events/{eventId}/dashboard"]}
      />
    );
  }

  if (!dashboard) {
    return <LoadingSkeleton type="card" count={4} />;
  }

  const occupied = Math.max(dashboard.totalCapacity - dashboard.remaining, 0);
  const waitingForCheckIn = Math.max(dashboard.approved - dashboard.checkedIn, 0);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Thống kê sự kiện"
        description={event?.title || "Số liệu trực tiếp từ backend"}
        actions={
          eventId && (
            <Button asChild>
              <Link to={`/organizer/events/${eventId}/check-in`}>
                <Ticket className="h-4 w-4" aria-hidden="true" /> Đi tới quét QR
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticCard label="Sức chứa" value={dashboard.totalCapacity} icon={Users} />
        <StatisticCard label="Đã giữ chỗ" value={occupied} icon={Ticket} color="warning" />
        <StatisticCard label="Đã cấp vé" value={dashboard.approved} icon={CheckCircle2} color="success" />
        <StatisticCard
          label="Tỷ lệ check-in"
          value={dashboard.checkInRate == null ? "Chưa có dữ liệu" : `${Math.round(dashboard.checkInRate * 100)}%`}
          icon={Gauge}
          color="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DonutChartCard
          title="Phân bổ sức chứa"
          data={[
            { name: "Đã giữ chỗ", value: occupied },
            { name: "Còn lại", value: dashboard.remaining },
          ]}
          colors={["#2563eb", "#cbd5e1"]}
        />
        <DonutChartCard
          title="Tình trạng check-in"
          data={[
            { name: "Đã check-in", value: dashboard.checkedIn },
            { name: "Chưa check-in", value: waitingForCheckIn },
          ]}
          colors={["#10b981", "#f59e0b"]}
        />
      </div>
    </div>
  );
}
