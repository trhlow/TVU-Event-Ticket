import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

const REQUIRED_ENDPOINTS = ['GET /organizer/events/{eventId}/statistics'];

export default function OrganizerEventStatsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    eventService
      .getByIdRemote(eventId)
      .then((item) => {
        if (mounted) setEvent(item);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Thống kê sự kiện' }]}
        title="Thống kê sự kiện"
        description={isLoading ? 'Đang tải sự kiện...' : event?.title || 'Không tìm thấy sự kiện.'}
        actions={
          eventId && (
            <Link
              to={`/organizer/events/${eventId}/check-in`}
              className="btn-press inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700"
            >
              <Ticket className="mr-2 h-4 w-4" aria-hidden="true" /> Đi tới quét QR
            </Link>
          )
        }
      />

      <BackendPendingNotice
        description="Backend chưa có API tổng hợp thống kê theo sự kiện (lượt đăng ký, tỷ lệ duyệt, tỷ lệ check-in theo thời gian). Trang này sẽ hiển thị số liệu thật ngay khi endpoint bên dưới sẵn sàng — xem danh sách đăng ký chi tiết tại trang Duyệt đăng ký."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
