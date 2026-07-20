import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import Toast from '../../components/common/Toast';
import EventForm from '../../components/events/EventForm';
import { requireCurrentUser } from '../../state/authSession';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

const BREADCRUMB_BASE = [{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Chỉnh sửa sự kiện' }];

export default function OrganizerEditEventPage() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const currentUser = requireCurrentUser();
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');

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
        <PageHeader breadcrumb={BREADCRUMB_BASE} title="Chỉnh sửa sự kiện" />
        <LoadingSkeleton type="list" count={4} />
      </div>
    );
  }

  if (!event || event.clubId !== currentUser.clubId) {
    return (
      <div className="space-y-6 text-left">
        <PageHeader breadcrumb={BREADCRUMB_BASE} title="Chỉnh sửa sự kiện" />
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
    setToastMsg(data.status === 'OPEN' ? 'Đã cập nhật và công bố sự kiện.' : 'Đã cập nhật sự kiện thành công.');
    setTimeout(() => navigate(`/organizer/events/${event.id}`), 850);
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[
          { label: 'Ban tổ chức', path: '/organizer' },
          { label: 'Quản lý sự kiện', path: '/organizer/events' },
          { label: 'Chỉnh sửa sự kiện' },
        ]}
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
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
