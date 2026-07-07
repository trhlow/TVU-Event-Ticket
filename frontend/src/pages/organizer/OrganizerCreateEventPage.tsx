import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import EventForm from '../../components/events/EventForm';
import Toast from '../../components/common/Toast';
import { getCurrentUser } from '../../data/mockAuth';
import { getEvents, saveEvents } from '../../data/mockEvents';
import { Event } from '../../types/event';

export default function OrganizerCreateEventPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [toastMsg, setToastMsg] = useState('');

  const handleSubmit = (data: Partial<Event>) => {
    const allEvents = getEvents();
    const newEvent: Event = {
      id: `event_new_${Date.now()}`,
      clubId: currentUser.clubId || 'club_it',
      clubName: currentUser.clubName || 'CLB Trường',
      title: data.title || '',
      description: data.description || '',
      category: data.category || 'Học thuật',
      bannerUrl:
        data.bannerUrl ||
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&auto=format&fit=crop&q=60',
      location: data.location || '',
      startAt: data.startAt || '',
      endAt: data.endAt || '',
      registrationOpenAt: data.registrationOpenAt || '',
      registrationCloseAt: data.registrationCloseAt || '',
      capacity: data.capacity || 100,
      remainingTickets: data.capacity || 100,
      status: data.status || 'UPCOMING',
    };

    saveEvents([newEvent, ...allEvents]);
    setToastMsg(
      newEvent.status === 'OPEN'
        ? 'Đã công bố sự kiện. Bạn có thể tạo QR đăng ký cho sinh viên.'
        : 'Đã lưu nháp sự kiện mới.',
    );
    setTimeout(() => navigate('/organizer/events'), 900);
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Tạo sự kiện' }]} />
      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">Tạo sự kiện mới</h2>
        <p className="text-sm font-medium text-gray-500">
          Điền đầy đủ thông tin, cấu hình thời gian đăng ký và số vé trước khi lưu nháp hoặc công bố.
        </p>
      </div>
      <EventForm
        clubId={currentUser.clubId || 'club_it'}
        clubName={currentUser.clubName || 'CLB Trường'}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/organizer/events')}
      />
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
