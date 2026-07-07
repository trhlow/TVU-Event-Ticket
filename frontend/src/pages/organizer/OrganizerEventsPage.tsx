import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Eye, QrCode, CheckSquare, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getEvents, saveEvents } from '../../data/mockEvents';
import { getCurrentUser } from '../../data/mockAuth';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import EventForm from '../../components/events/EventForm';
import ConfirmModal from '../../components/common/ConfirmModal';
import Toast from '../../components/common/Toast';
import Breadcrumb from '../../components/common/Breadcrumb';
import { formatDateTime } from '../../utils/formatDate';
import { Event } from '../../types/event';

export default function OrganizerEventsPage() {
  const currentUser = getCurrentUser();

  const [events, setEvents] = useState(() => 
    getEvents().filter(e => e.clubId === currentUser.clubId)
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  // Table columns definition
  const columns = [
    {
      header: 'Tên Sự Kiện / Thể loại',
      accessor: (evt: Event) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{evt.title}</span>
          <span className="text-[10px] text-gray-400 font-extrabold block mt-1 uppercase tracking-wider">{evt.category}</span>
        </div>
      ),
    },
    {
      header: 'Thời Gian Bắt Đầu',
      accessor: (evt: Event) => (
        <span className="text-[11px] font-semibold text-gray-700">{formatDateTime(evt.startAt)}</span>
      ),
    },
    {
      header: 'Vé Phát Hành',
      accessor: (evt: Event) => (
        <span className="font-bold text-gray-900 font-mono">
          {evt.remainingTickets} / {evt.capacity}
        </span>
      ),
    },
    {
      header: 'Trạng Thái',
      accessor: (evt: Event) => <StatusBadge type="event" status={evt.status} />,
    },
    {
      header: 'Hành động',
      accessor: (evt: Event) => (
        <div className="flex flex-wrap gap-1 justify-end">
          <Link
            to={`/organizer/events/${evt.id}`}
            className="p-1.5 text-gray-600 hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-lg transition-colors cursor-pointer"
            title="Xem chi tiết"
          >
            <Eye className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => handleEditClick(evt)}
            className="p-1.5 text-brand-600 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 rounded-lg transition-colors cursor-pointer"
            title="Chỉnh sửa"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <Link
            to={`/organizer/events/${evt.id}/registration-qr`}
            className="p-1.5 text-sky-700 hover:bg-sky-50 border border-gray-100 hover:border-sky-200 rounded-lg transition-colors cursor-pointer"
            title="QR đăng ký"
          >
            <QrCode className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={`/organizer/events/${evt.id}/registrations`}
            className="p-1.5 text-emerald-700 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 rounded-lg transition-colors cursor-pointer"
            title="Duyệt đăng ký"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </Link>
          <Link
            to={`/organizer/events/${evt.id}/statistics`}
            className="p-1.5 text-indigo-700 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer"
            title="Thống kê"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => handleDeleteClick(evt.id)}
            className="p-1.5 text-rose-600 hover:bg-rose-50 border border-gray-100 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
            title="Xóa sự kiện"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const handleCreateNew = () => {
    setEditingEvent(undefined);
    setIsFormOpen(true);
  };

  const handleEditClick = (evt: Event) => {
    setEditingEvent(evt);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingEventId(id);
  };

  const handleFormSubmit = (data: Partial<Event>) => {
    const allEvents = getEvents();

    if (editingEvent) {
      // Edit
      const index = allEvents.findIndex(e => e.id === editingEvent.id);
      if (index !== -1) {
        allEvents[index] = {
          ...allEvents[index],
          ...data,
        } as Event;
        setToastMsg('Cập nhật sự kiện thành công!');
      }
    } else {
      // Create
      const newEvent: Event = {
        id: `event_new_${Date.now()}`,
        clubId: currentUser.clubId || 'club_it',
        clubName: currentUser.clubName || 'CLB Trường',
        title: data.title || '',
        description: data.description || '',
        category: data.category || 'Học thuật',
        bannerUrl: data.bannerUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
        location: data.location || '',
        startAt: data.startAt || '',
        endAt: data.endAt || '',
        registrationOpenAt: data.registrationOpenAt || '',
        registrationCloseAt: data.registrationCloseAt || '',
        capacity: data.capacity || 100,
        remainingTickets: data.capacity || 100,
        status: data.status || 'UPCOMING',
      };
      allEvents.unshift(newEvent);
      setToastMsg('Tạo sự kiện mới thành công!');
    }

    saveEvents(allEvents);
    
    // Refresh local list
    setEvents(allEvents.filter(e => e.clubId === currentUser.clubId));
    setIsFormOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingEventId) return;

    const allEvents = getEvents();
    const updated = allEvents.filter(e => e.id !== deletingEventId);
    saveEvents(updated);

    setEvents(updated.filter(e => e.clubId === currentUser.clubId));
    setToastMsg('Đã xóa sự kiện thành công.');
    setDeletingEventId(null);
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Quản lý sự kiện' }]} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-950 tracking-tight">Quản Lý Sự Kiện Câu Lạc Bộ</h2>
          <p className="text-xs text-gray-500 font-semibold">Tạo sự kiện mới, chỉnh sửa nội dung, số lượng vé và cấu hình trạng thái đăng ký</p>
        </div>
        
        {!isFormOpen && (
          <button
            onClick={handleCreateNew}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tạo sự kiện mới
          </button>
        )}
      </div>

      {isFormOpen ? (
        <div className="animate-fade-in">
          <EventForm
            initialData={editingEvent}
            clubId={currentUser.clubId || 'club_it'}
            clubName={currentUser.clubName || 'CLB Trường'}
            onSubmit={handleFormSubmit}
            onCancel={() => setIsFormOpen(false)}
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <DataTable
            data={events}
            columns={columns}
            searchPlaceholder="Tìm kiếm tên sự kiện..."
            searchField="title"
          />
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingEventId && (
        <ConfirmModal
          isOpen={!!deletingEventId}
          title="Xác Nhận Xóa Sự Kiện"
          message="Bạn có chắc chắn muốn xóa sự kiện này? Thao tác này không thể hoàn tác và toàn bộ lịch sử đăng ký, vé QR liên quan sẽ bị hủy bỏ."
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEventId(null)}
          confirmText="Có, Xóa Sự Kiện"
          cancelText="Không"
          type="danger"
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
