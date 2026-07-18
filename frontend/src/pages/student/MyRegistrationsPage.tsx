import React, { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { requireCurrentUser } from "../../state/authSession";
import StatusBadge from "../../components/common/StatusBadge";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../components/common/ToastProvider";
import { formatDateTime } from "../../utils/formatDate";
import { Reservation } from "../../types/reservation";
import { registrationService } from "../../services/registrationService";

const TABS = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

export default function MyRegistrationsPage() {
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("ALL");

  useEffect(() => {
    let mounted = true;
    registrationService.listByStudentRemote(currentUser.id)
      .then((items) => {
        if (mounted) setReservations(items);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải danh sách đăng ký.", "error");
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const filtered = useMemo(() => {
    if (activeTab === "ALL") return reservations;
    return reservations.filter((reservation) => reservation.status === activeTab);
  }, [reservations, activeTab]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Sinh viên", path: "/student" }, { label: "Lịch sử đăng ký" }]}
        title="Tiến trình đăng ký của bạn"
        description="Theo dõi trạng thái chờ duyệt, đã duyệt và bị từ chối cho từng lượt đăng ký sự kiện."
      />

      <div className="flex border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative cursor-pointer px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === tab ? "text-brand-700" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {tab === "ALL" ? "Tất cả" : tab === "PENDING" ? "Chờ duyệt" : tab === "APPROVED" ? "Đã duyệt" : "Bị từ chối"}
            <span
              className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600 transition-opacity duration-200 ${activeTab === tab ? "opacity-100" : "opacity-0"}`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((reservation) => (
            <div
              key={reservation.id}
              className="tilt-card enterprise-card relative flex flex-col items-start justify-between gap-4 overflow-hidden p-5 md:flex-row md:items-center"
            >
              <div className="tilt-card-sheen" aria-hidden="true" />
              <div className="relative min-w-0 space-y-1.5">
                <span className="block text-[10px] font-bold text-slate-400">{formatDateTime(reservation.createdAt)}</span>
                <h4 className="max-w-xl truncate pr-4 text-sm font-extrabold text-slate-950">
                  {reservation.eventTitle || "Sự kiện đang cập nhật thông tin"}
                </h4>
                <p className="text-[11px] font-semibold text-slate-500">
                  MSSV: <span className="font-mono text-brand-600">{reservation.mssv || "Chưa cập nhật"}</span>
                </p>
                {reservation.rejectReason && (
                  <div className="mt-2 max-w-lg rounded-xl border border-danger-100 bg-danger-50 p-2.5 text-[10px] font-semibold text-danger-700">
                    {reservation.rejectReason}
                  </div>
                )}
              </div>
              <div className="relative shrink-0">
                <StatusBadge type="reservation" status={reservation.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Không có đăng ký nào"
          description="Backend chưa trả về đăng ký phù hợp với bộ lọc này."
        />
      )}
    </div>
  );
}
