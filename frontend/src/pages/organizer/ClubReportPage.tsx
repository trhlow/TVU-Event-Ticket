import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, ShieldCheck, Ticket } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatisticCard from "../../components/common/StatisticCard";
import LineChartCard from "../../components/charts/LineChartCard";
import DonutChartCard from "../../components/charts/DonutChartCard";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import { ClubDashboard, dashboardService } from "../../services/dashboardService";

export default function ClubReportPage() {
  const [dashboard, setDashboard] = useState<ClubDashboard | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;
    dashboardService
      .clubDashboard()
      .then((result) => {
        if (mounted) setDashboard(result);
      })
      .catch((error) => {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "Không thể tải báo cáo câu lạc bộ.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const registrationsByDay = useMemo(
    () =>
      (dashboard?.registrationsByDay ?? []).map((point) => ({
        date: point.date.slice(5),
        "Lượt đăng ký": point.count,
      })),
    [dashboard],
  );

  if (loadError) {
    return (
      <BackendPendingNotice
        title="Không thể tải báo cáo câu lạc bộ"
        description={loadError}
        requiredEndpoints={["GET /ticketing/dashboard/club"]}
      />
    );
  }

  if (!dashboard) {
    return <LoadingSkeleton type="card" count={5} />;
  }

  const notCheckedIn = Math.max(dashboard.approved - dashboard.checkedIn, 0);

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <PageHeader
        title="Báo cáo và thống kê hoạt động CLB"
        description="Số liệu trực tiếp từ backend về đăng ký, phát hành vé và check-in của câu lạc bộ."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticCard label="Chờ duyệt" value={dashboard.pending} icon={ClipboardList} color="warning" />
        <StatisticCard label="Đã cấp vé" value={dashboard.approved} icon={Ticket} />
        <StatisticCard label="Đã check-in" value={dashboard.checkedIn} icon={CheckCircle2} color="success" />
        <StatisticCard
          label="Tỷ lệ check-in"
          value={dashboard.checkInRate == null ? "Chưa có dữ liệu" : `${Math.round(dashboard.checkInRate * 100)}%`}
          icon={ShieldCheck}
          color="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {registrationsByDay.length > 0 ? (
            <LineChartCard
              title="Lượt đăng ký theo ngày"
              data={registrationsByDay}
              xAxisKey="date"
              dataKeys={[{ key: "Lượt đăng ký", name: "Lượt đăng ký", color: "#2563eb" }]}
            />
          ) : (
            <div className="enterprise-card grid min-h-72 place-items-center p-6 text-sm font-semibold text-slate-500">
              Chưa có lượt đăng ký trong khoảng thời gian thống kê.
            </div>
          )}
        </div>
        <DonutChartCard
          title="Tình trạng tham dự"
          data={[
            { name: "Đã check-in", value: dashboard.checkedIn },
            { name: "Chưa check-in", value: notCheckedIn },
            { name: "Chờ duyệt", value: dashboard.pending },
          ]}
          colors={["#10b981", "#94a3b8", "#f59e0b"]}
        />
      </div>
    </div>
  );
}
