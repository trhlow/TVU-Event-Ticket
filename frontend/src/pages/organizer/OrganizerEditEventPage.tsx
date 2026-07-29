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

  useEffect(() => {
    let mounted = true;

    async function loadEvent() {
      if (!eventId) return;
      setIsLoading(true);
      // The single-event GET /events/{id} endpoint only serves OPEN events (public discovery
      // route) — DRAFT/CLOSED events an organizer owns 404 there. /events/mine returns every
      // status for the caller's own club, matching OrganizerEventDetailPage's fetch.
      const events = await eventService.listByClubRemote(currentUser.clubId || "");
      const found = events.find((item) => item.id === eventId);
      if (mounted) {
        setEvent(found);
        setIsLoading(false);
      }
    }

    void loadEvent();

    return () => {
      mounted = false;
    };
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
          title="Không tìm thấy sự kiện"
          description="Sự kiện không tồn tại hoặc không thuộc câu lạc bộ bạn đang quản lý."
          actionText="Quay lại danh sách"
          onAction={() => navigate('/organizer/events')}
        />
      </div>
    );
  }

  const handleSubmit = async (data: Partial<Event>) => {
    await eventService.update(event.id, data);
    showToast('Đã cập nhật sự kiện thành công.');
    setTimeout(() => navigate(`/organizer/events/${event.id}`), 850);
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
