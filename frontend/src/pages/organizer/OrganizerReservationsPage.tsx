import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Eye, ShieldCheck, Users, XCircle } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import ConfirmModal from "../../components/common/ConfirmModal";
import Dialog from "../../components/common/Dialog";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import { useToast } from "../../hooks/useToast";
import { Reservation } from "../../types/reservation";
import { formatDateTime } from "../../utils/formatDate";
import { registrationService } from "../../services/registrationService";

export default function OrganizerReservationsPage() {
  const { eventId } = useParams<{ eventId?: string }>();
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "APPROVE" | "REJECT" } | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // The pending-queue endpoint drops a reservation the moment it's approved/rejected, so there's
  // no server-side count to show for "processed" — this tracks it locally for this page visit only.
  const [processedCount, setProcessedCount] = useState(0);

  const loadReservations = useCallback(async () => {
    setIsLoading(true);
    try {
      setReservations(await registrationService.listRemote());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải danh sách đăng ký.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  // /reservations/pending returns every pending reservation for the organizer's whole club — the
  // backend has no eventId filter — so when this page is reached via the per-event route, filter
  // client-side to avoid approving/rejecting a registration that belongs to a different event.
  const scopedReservations = useMemo(
    () => (eventId ? reservations.filter((reservation) => reservation.eventId === eventId) : reservations),
    [reservations, eventId],
  );

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      await registrationService.updateStatus(pendingAction.id, pendingAction.type === "APPROVE" ? "APPROVED" : "REJECTED");
      showToast(pendingAction.type === "APPROVE" ? "Đã duyệt đăng ký." : "Đã từ chối đăng ký.");
      setPendingAction(null);
      setProcessedCount((count) => count + 1);
      await loadReservations();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể xử lý đăng ký.", "error");
    }
  };

  const columns = [
    {
      header: "Sinh viên",
      accessor: (reservation: Reservation) => (
        <div>
          <p className="font-extrabold text-slate-950">{reservation.studentName || reservation.email}</p>
          {/* Backend doesn't return a student display name yet (see registrationService.ts), so
              studentName is always "" and the line above already shows the email as a fallback.
              Repeating it here would just duplicate the same text under every row. */}
          {reservation.studentName && <p className="mt-1 text-xs font-semibold text-slate-500">{reservation.email}</p>}
        </div>
      ),
    },
    {
      header: "MSSV",
      accessor: (reservation: Reservation) => <p className="font-mono font-black text-slate-900">{reservation.mssv || "N/A"}</p>,
    },
    {
      header: "Sự kiện",
      accessor: (reservation: Reservation) => (
        <span className="block max-w-[220px] truncate font-bold text-slate-900" title={reservation.eventTitle}>
          {reservation.eventTitle || "Sự kiện đang cập nhật thông tin"}
        </span>
      ),
    },
    { header: "Thời gian", accessor: (reservation: Reservation) => <span className="text-xs font-bold text-slate-500">{formatDateTime(reservation.createdAt)}</span> },
    { header: "Trạng thái", accessor: (reservation: Reservation) => <StatusBadge type="reservation" status={reservation.status} /> },
    {
      header: "Hành động",
      className: "text-right",
      accessor: (reservation: Reservation) => (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setSelectedReservation(reservation)}
            className="btn-press grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Xem chi tiết"
          >
            <Eye className="h-4 w-4" />
          </button>
          {reservation.status === "PENDING" && (
            <>
              <button onClick={() => setPendingAction({ id: reservation.id, type: "APPROVE" })} className="btn-press inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-success-200 bg-success-50 px-3 text-xs font-extrabold text-success-700">
                <ShieldCheck className="h-4 w-4" /> Duyệt
              </button>
              <button onClick={() => setPendingAction({ id: reservation.id, type: "REJECT" })} className="btn-press inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3 text-xs font-extrabold text-danger-700">
                <XCircle className="h-4 w-4" /> Từ chối
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Duyệt đăng ký sự kiện"
        description={
          eventId
            ? "Chỉ hiển thị đăng ký của sự kiện đang chọn — GET /reservations/pending trả về toàn bộ CLB, danh sách này đã được lọc lại theo sự kiện tại trình duyệt."
            : "Hàng đợi chờ duyệt của toàn CLB — GET /reservations/pending không trả về đăng ký đã xử lý. Đăng ký đã duyệt biến thành vé tại trang Vé đã cấp; đăng ký đã từ chối chỉ còn trong audit log."
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <StatisticCard label="Chờ duyệt" value={scopedReservations.length} icon={Users} color="warning" />
        <StatisticCard label="Đã xử lý trong phiên này" value={processedCount} icon={ShieldCheck} color="success" />
      </div>

      {isLoading ? (
        <LoadingSkeleton type="table" count={5} />
      ) : (
        <DataTable data={scopedReservations} columns={columns} searchPlaceholder="Tìm sinh viên, MSSV, email..." searchField={(row) => `${row.studentName} ${row.mssv} ${row.email}`} />
      )}

      <Dialog
        isOpen={!!selectedReservation}
        onClose={() => setSelectedReservation(null)}
        title="Chi tiết đăng ký"
        footer={
          <button
            onClick={() => setSelectedReservation(null)}
            className="btn-press min-h-11 w-full rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700"
          >
            Đóng
          </button>
        }
      >
        {selectedReservation && (
          <div className="space-y-3 text-xs font-semibold text-slate-600">
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Sinh viên</span>
              <span className="text-right font-extrabold text-slate-950">{selectedReservation.studentName || selectedReservation.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Email</span>
              <span className="text-right font-bold text-slate-900">{selectedReservation.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">MSSV</span>
              <span className="text-right font-mono font-bold text-slate-900">{selectedReservation.mssv || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Lớp</span>
              <span className="text-right font-bold text-slate-900">{selectedReservation.className || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Sự kiện</span>
              <span className="text-right font-bold text-slate-900">{selectedReservation.eventTitle || "N/A"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Thời gian gửi</span>
              <span className="text-right font-bold text-slate-900">{formatDateTime(selectedReservation.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Trạng thái</span>
              <StatusBadge type="reservation" status={selectedReservation.status} />
            </div>
            {selectedReservation.rejectReason && (
              <div className="rounded-xl border border-danger-100 bg-danger-50 p-3 text-danger-700">
                Lý do từ chối: {selectedReservation.rejectReason}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {pendingAction && (
        <ConfirmModal
          isOpen={!!pendingAction}
          title={pendingAction.type === "APPROVE" ? "Xác nhận duyệt" : "Từ chối đăng ký"}
          description="Hệ thống sẽ tự kiểm tra số vé còn lại và phạm vi CLB trước khi xác nhận thao tác này."
          onConfirm={() => void handleConfirmAction()}
          onCancel={() => setPendingAction(null)}
          confirmText={pendingAction.type === "APPROVE" ? "Duyệt" : "Từ chối"}
          cancelText="Hủy"
          type={pendingAction.type === "APPROVE" ? "success" : "danger"}
        />
      )}
    </div>
  );
}
