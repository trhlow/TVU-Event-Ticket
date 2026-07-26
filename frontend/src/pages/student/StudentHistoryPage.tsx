import React, { useEffect, useMemo, useState } from 'react';
import { FileClock, Info } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatDate';
import { requireCurrentUser } from '../../state/authSession';
import { registrationService } from '../../services/registrationService';
import { Reservation } from '../../types/reservation';

export default function StudentHistoryPage() {
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    registrationService
      .listByStudentRemote(currentUser.id)
      .then((items) => {
        if (mounted) setReservations(items);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : 'Không thể tải lịch sử tham gia.', 'error');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // "History" means events that have already happened — a reservation whose event hasn't
  // started yet belongs on "Đăng ký của tôi", not here.
  const pastReservations = useMemo(() => {
    const now = Date.now();
    return reservations
      .filter((reservation) => reservation.eventStartAt && new Date(reservation.eventStartAt).getTime() <= now)
      .sort((a, b) => new Date(b.eventStartAt).getTime() - new Date(a.eventStartAt).getTime());
  }, [reservations]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Lịch sử tham gia"
        description="Các sự kiện đã diễn ra mà bạn từng đăng ký, kèm trạng thái duyệt."
      />

      {isLoading ? null : pastReservations.length > 0 ? (
        <>
          <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
            <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
              Trang này chưa hiển thị được trạng thái điểm danh (đã check-in hay chưa) cho từng lượt tham gia — tính năng này sẽ bổ
              sung khi hệ thống hỗ trợ.
            </p>
          </div>
          <div className="space-y-4">
            {pastReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="tilt-card enterprise-card relative flex flex-col items-start justify-between gap-4 overflow-hidden p-5 md:flex-row md:items-center"
              >
                <div className="tilt-card-sheen" aria-hidden="true" />
                <div className="relative min-w-0 space-y-1.5">
                  <span className="block text-[10px] font-bold text-slate-400">{formatDateTime(reservation.eventStartAt)}</span>
                  <h4 className="max-w-xl truncate pr-4 text-sm font-extrabold text-slate-950">
                    {reservation.eventTitle || 'Sự kiện đang cập nhật thông tin'}
                  </h4>
                  {reservation.eventLocation && (
                    <p className="text-[11px] font-semibold text-slate-500">{reservation.eventLocation}</p>
                  )}
                </div>
                <div className="relative shrink-0">
                  <StatusBadge type="reservation" status={reservation.status} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={FileClock}
          title="Chưa có sự kiện nào trong lịch sử"
          description="Các sự kiện bạn đăng ký sau khi đã diễn ra sẽ xuất hiện tại đây."
        />
      )}
    </div>
  );
}
