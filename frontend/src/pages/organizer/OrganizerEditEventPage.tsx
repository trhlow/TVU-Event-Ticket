import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import EmptyState from '../../components/common/EmptyState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import Toast from '../../components/common/Toast';
import EventForm from '../../components/events/EventForm';
import { getCurrentUser } from '../../state/authSession';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

export default function OrganizerEditEventPage() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const currentUser = getCurrentUser();
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
        <Breadcrumb items={[{ label: 'Ban to chuc', path: '/organizer' }, { label: 'Chinh sua su kien' }]} />
        <LoadingSkeleton type="list" count={4} />
      </div>
    );
  }

  if (!event || event.clubId !== currentUser.clubId) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: 'Ban to chuc', path: '/organizer' }, { label: 'Chinh sua su kien' }]} />
        <EmptyState
          title="Khong tim thay su kien"
          description="Su kien khong ton tai hoac khong thuoc cau lac bo ban dang quan ly."
          actionText="Quay lai danh sach"
          onAction={() => navigate('/organizer/events')}
        />
      </div>
    );
  }

  const handleSubmit = async (data: Partial<Event>) => {
    await eventService.update(event.id, data);
    setToastMsg(data.status === 'OPEN' ? 'Da cap nhat va cong bo su kien.' : 'Da cap nhat su kien thanh cong.');
    setTimeout(() => navigate(`/organizer/events/${event.id}`), 850);
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb
        items={[
          { label: 'Ban to chuc', path: '/organizer' },
          { label: 'Quan ly su kien', path: '/organizer/events' },
          { label: 'Chinh sua su kien' },
        ]}
      />
      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">Chinh sua su kien</h2>
        <p className="text-sm font-medium text-gray-500">
          Cap nhat noi dung, thoi gian dang ky, so luong ve va trang thai phat hanh cho su kien cua cau lac bo.
        </p>
      </div>
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
