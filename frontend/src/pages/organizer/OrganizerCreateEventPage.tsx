import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EventForm from '../../components/events/EventForm';
import Toast from '../../components/common/Toast';
import { getCurrentUser } from '../../state/authSession';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

export default function OrganizerCreateEventPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [toastMsg, setToastMsg] = useState('');

  const handleSubmit = async (data: Partial<Event>) => {
    // POST /events always creates the event as DRAFT server-side regardless of what the form
    // sends — the toast must reflect that, not whatever status the form happened to have set.
    await eventService.create(data);
    setToastMsg('Đã lưu sự kiện mới dưới dạng nháp (DRAFT). Mở đăng ký từ trang chi tiết khi sẵn sàng công bố.');
    setTimeout(() => navigate('/organizer/events'), 900);
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Tạo sự kiện' }]}
        title="Tạo sự kiện mới"
        description="Điền đầy đủ thông tin, cấu hình thời gian đăng ký và số vé. Sự kiện luôn được lưu ở trạng thái nháp trước khi công bố."
      />
      <EventForm
        clubId={currentUser.clubId || ''}
        clubName={currentUser.clubName || 'CLB'}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/organizer/events')}
      />
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
