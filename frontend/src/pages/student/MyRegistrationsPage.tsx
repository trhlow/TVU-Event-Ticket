import React, { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { getCurrentUser } from "../../state/authSession";
import StatusBadge from "../../components/common/StatusBadge";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import { Reservation } from "../../types/reservation";
import { registrationService } from "../../services/registrationService";

export default function MyRegistrationsPage() {
  const currentUser = getCurrentUser();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    registrationService.listByStudentRemote(currentUser.id)
      .then((items) => {
        if (mounted) setReservations(items);
      })
      .catch((error) => {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach dang ky.");
      });
    return () => {
      mounted = false;
    };
  }, [currentUser.id]);

  const filtered = useMemo(() => {
    if (activeTab === "ALL") return reservations;
    return reservations.filter((reservation) => reservation.status === activeTab);
  }, [reservations, activeTab]);

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Sinh vien", path: "/student" }, { label: "Lich su dang ky" }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black tracking-tight text-gray-950">Tien trinh dang ky cua ban</h2>
        <p className="text-xs font-semibold text-gray-500">Theo doi trang thai PENDING, APPROVED va REJECTED tu backend.</p>
      </div>

      <div className="flex border-b border-gray-200">
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`cursor-pointer border-b-2 px-4 py-2 text-xs font-bold transition-all ${
              activeTab === tab ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((reservation) => (
            <div
              key={reservation.id}
              className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md md:flex-row md:items-center"
            >
              <div className="min-w-0 space-y-1.5">
                <span className="block text-[10px] font-bold text-gray-400">{formatDateTime(reservation.createdAt)}</span>
                <h4 className="max-w-xl truncate pr-4 text-sm font-extrabold text-gray-950">{reservation.eventId}</h4>
                <p className="text-[11px] font-semibold text-gray-500">
                  MSSV: <span className="font-mono text-brand-600">{reservation.mssv || "Chua cap nhat"}</span>
                </p>
                {reservation.rejectReason && (
                  <div className="mt-2 max-w-lg rounded-xl border border-rose-100 bg-rose-50 p-2.5 text-[10px] font-semibold text-rose-800">
                    {reservation.rejectReason}
                  </div>
                )}
              </div>
              <StatusBadge type="reservation" status={reservation.status} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-gray-100 bg-white p-8 py-16 text-center shadow-sm">
          <ListChecks className="mx-auto h-12 w-12 text-gray-300" />
          <h4 className="text-sm font-bold text-gray-950">Khong co dang ky nao</h4>
          <p className="text-xs font-semibold leading-relaxed text-gray-500">Backend chua tra ve dang ky phu hop voi bo loc nay.</p>
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
