import React, { useState, useMemo } from 'react';
import { Trash2, ListChecks } from 'lucide-react';
import { getReservations, saveReservations } from '../../data/mockReservations';
import { mockEvents } from '../../data/mockEvents';
import { getCurrentUser } from '../../data/mockAuth';
import StatusBadge from '../../components/common/StatusBadge';
import { formatDateTime } from '../../utils/formatDate';
import Breadcrumb from '../../components/common/Breadcrumb';
import Toast from '../../components/common/Toast';
import ConfirmModal from '../../components/common/ConfirmModal';

export default function MyRegistrationsPage() {
  const currentUser = getCurrentUser();
  const [reservations, setReservations] = useState(() => 
    getReservations().filter(r => r.studentId === currentUser.id)
  );

  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [toastMsg, setToastMsg] = useState('');
  const [selectedResId, setSelectedResId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (activeTab === 'ALL') return reservations;
    return reservations.filter(r => r.status === activeTab);
  }, [reservations, activeTab]);

  const handleCancelRequest = (resId: string) => {
    setSelectedResId(resId);
  };

  const handleConfirmCancel = () => {
    if (!selectedResId) return;

    // Remove from mock data
    const allReservations = getReservations();
    const updated = allReservations.filter(r => r.id !== selectedResId);
    saveReservations(updated);

    // Update local state
    setReservations(prev => prev.filter(r => r.id !== selectedResId));
    setToastMsg('Hủy yêu cầu đăng ký vé thành công!');
    setSelectedResId(null);
  };

  const getEventDetail = (eventId: string) => {
    return mockEvents.find(e => e.id === eventId);
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Lịch sử đăng ký' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Tiến Trình Đăng Ký Của Bạn</h2>
        <p className="text-xs text-gray-500 font-semibold">Theo dõi trạng thái duyệt đơn đăng ký của ban tổ chức CLB trường</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === tab
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab === 'ALL' && 'Tất cả'}
            {tab === 'PENDING' && 'Chờ duyệt'}
            {tab === 'APPROVED' && 'Đã duyệt'}
            {tab === 'REJECTED' && 'Bị từ chối'}
          </button>
        ))}
      </div>

      {/* List items */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((res) => {
            const event = getEventDetail(res.eventId);
            if (!event) return null;

            return (
              <div
                key={res.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all"
              >
                <div className="space-y-1.5 min-w-0">
                  <span className="text-[10px] text-gray-400 font-bold block">{formatDateTime(res.createdAt)}</span>
                  <h4 className="text-sm font-extrabold text-gray-950 truncate max-w-xl pr-4">{event.title}</h4>
                  <p className="text-[11px] text-gray-500 font-semibold">Đơn vị: <span className="text-brand-600">{event.clubName}</span></p>
                  
                  {res.rejectReason && (
                    <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-800 font-semibold mt-2 max-w-lg">
                      <span className="font-extrabold block mb-0.5">Lý do từ chối:</span>
                      {res.rejectReason}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                  <StatusBadge type="reservation" status={res.status} />

                  {res.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancelRequest(res.id)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer"
                      title="Hủy đăng ký"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center bg-white border border-gray-100 rounded-2xl p-8 max-w-md mx-auto shadow-sm space-y-3">
          <ListChecks className="w-12 h-12 text-gray-300 mx-auto" />
          <h4 className="text-sm font-bold text-gray-950">Không có đăng ký nào</h4>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Bạn hiện chưa có đơn đăng ký sự kiện nào tương thích với bộ lọc này.
          </p>
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedResId && (
        <ConfirmModal
          isOpen={!!selectedResId}
          title="Xác Nhận Hủy Yêu Cầu Đăng Ký"
          message="Bạn có chắc chắn muốn hủy đơn đăng ký tham gia sự kiện này không? Số lượng vé sẽ được trả lại cho hệ thống."
          onConfirm={handleConfirmCancel}
          onCancel={() => setSelectedResId(null)}
          confirmText="Có, Hủy Đăng Ký"
          cancelText="Không"
          type="danger"
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
