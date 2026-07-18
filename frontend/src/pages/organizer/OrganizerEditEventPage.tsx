import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EventForm from '../../components/events/EventForm';
import { useToast } from '../../components/common/ToastProvider';
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
      const found = await eventService.getByIdRemote(eventId);
      if (mounted) {
        setEvent(found);
        setIsLoading(false);
      }
    }

    void loadEvent();

    return () => {
      mounted = false;
    };
  }, [eventId]);

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
    showToast(data.status === 'OPEN' ? 'Đã cập nhật và công bố sự kiện.' : 'Đã cập nhật sự kiện thành công.');
    setTimeout(() => navigate(`/organizer/events/${event.id}`), 850);
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Chỉnh sửa sự kiện"
        description="Cập nhật nội dung, thời gian đăng ký, số lượng vé và trạng thái phát hành cho sự kiện của câu lạc bộ."
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
