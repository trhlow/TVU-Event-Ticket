import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EventForm from '../../components/events/EventForm';
import { useToast } from '../../hooks/useToast';
import { requireCurrentUser } from '../../state/authSession';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

export default function OrganizerEditEventPage() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadEvent() {
      if (!eventId) return;
      setIsLoading(true);
      setLoadFailed(false);
      try {
        // The single-event GET /events/{id} endpoint only serves OPEN events (public discovery
        // route) — DRAFT/CLOSED events an organizer owns 404 there. /events/mine returns every
        // status for the caller's own club, matching OrganizerEventDetailPage's fetch.
        const events = await eventService.listByClubRemote(currentUser.clubId || "");
        const found = events.find((item) => item.id === eventId);
        if (mounted) setEvent(found);
      } catch (error) {
        if (mounted) {
          setLoadFailed(true);
          showToast(error instanceof Error ? error.message : 'Không thể tải sự kiện.', 'error');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvent();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, currentUser.clubId]);

  if (!eventId) return <Navigate to="/organizer/events" replace />;

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <PageHeader title="Chỉnh sửa sự kiện" />
        <LoadingSkeleton type="list" count={4} />
      </div>
    );
  }

  if (!event || event.clubId !== currentUser.clubId) {
    return (
      <div className="space-y-6 text-left">
        <PageHeader title="Chỉnh sửa sự kiện" />
        <EmptyState
          title={loadFailed ? "Không thể tải sự kiện" : "Không tìm thấy sự kiện"}
          description={
            loadFailed
              ? "Đã xảy ra lỗi khi tải dữ liệu sự kiện. Vui lòng thử lại."
              : "Sự kiện không tồn tại hoặc không thuộc câu lạc bộ bạn đang quản lý."
          }
          actionText={loadFailed ? "Thử lại" : "Quay lại danh sách"}
          onAction={() => (loadFailed ? navigate(0) : navigate('/organizer/events'))}
        />
      </div>
    );
  }

  const handleSubmit = async (data: Partial<Event>) => {
    try {
      await eventService.update(event.id, data);
      showToast('Đã cập nhật sự kiện thành công.');
      setTimeout(() => navigate(`/organizer/events/${event.id}`), 850);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể cập nhật sự kiện. Vui lòng thử lại.', 'error');
    }
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Chỉnh sửa sự kiện"
        description="Cập nhật nội dung, thời gian đăng ký và số lượng vé. Mở/đóng đăng ký từ danh sách sự kiện hoặc trang chi tiết."
      />
      <EventForm
        initialData={event}
        clubId={currentUser.clubId || event.clubId}
        clubName={currentUser.clubName || event.clubName}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/organizer/events/${event.id}`)}
      />
    </div>
  );
}
