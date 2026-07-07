import React, { useState } from 'react';
import { Ticket, Info } from 'lucide-react';
import { getTickets } from '../../data/mockTickets';
import { mockEvents } from '../../data/mockEvents';
import { getCurrentUser } from '../../data/mockAuth';
import TicketCard from '../../components/tickets/TicketCard';
import QRDisplayCard from '../../components/tickets/QRDisplayCard';
import DetailDrawer from '../../components/common/DetailDrawer';
import Breadcrumb from '../../components/common/Breadcrumb';

export default function MyTicketsPage() {
  const currentUser = getCurrentUser();
  const [tickets] = useState(() => 
    getTickets().filter(t => t.studentId === currentUser.id && t.status === 'VALID')
  );

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const activeTicket = tickets.find(t => t.id === selectedTicketId);
  const activeEvent = activeTicket ? mockEvents.find(e => e.id === activeTicket.eventId) : null;

  const handleViewQR = (id: string) => {
    setSelectedTicketId(id);
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Ví vé QR của tôi' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Ví Vé QR Điện Tử Cá Nhân</h2>
        <p className="text-xs text-gray-500 font-semibold">Tất cả vé tham dự của bạn. Vui lòng xuất trình mã QR tương ứng để điểm danh tại sự kiện</p>
      </div>

      {tickets.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {tickets.map((tkt) => {
            const event = mockEvents.find(e => e.id === tkt.eventId);
            if (!event) return null;

            return (
              <TicketCard
                key={tkt.id}
                ticket={tkt}
                event={event}
                onViewQR={handleViewQR}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center bg-white border border-gray-200 rounded-2xl p-8 max-w-md mx-auto shadow-sm space-y-3">
          <Ticket className="w-12 h-12 text-gray-300 mx-auto" />
          <h4 className="text-sm font-bold text-gray-950">Ví vé của bạn đang trống</h4>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Bạn chưa có vé sự kiện hợp lệ nào được cấp. Sau khi đăng ký và được Ban tổ chức phê duyệt, vé QR sẽ xuất hiện tại đây ngay lập tức.
          </p>
        </div>
      )}

      {/* Guidelines alert */}
      <div className="p-4 bg-brand-50/50 border border-brand-100 rounded-xl flex gap-3 text-left">
        <Info className="w-5 h-5 text-brand-600 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-extrabold text-brand-900 leading-none">Chính sách bảo mật vé QR</p>
          <p className="text-[10px] text-brand-800 leading-relaxed font-semibold">
            Không chụp màn hình mã QR gửi cho người khác sử dụng. Máy quét điểm danh tại cửa chỉ chấp nhận duy nhất một lượt quét cho mỗi mã vé định danh. Trường hợp trùng lặp vé sẽ không thể check-in vào sự kiện.
          </p>
        </div>
      </div>

      {/* Detail Drawer for QR Display */}
      {activeTicket && activeEvent && (
        <DetailDrawer
          isOpen={!!selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          title="Mã QR Vé Vào Cửa"
        >
          <div className="p-1">
            <QRDisplayCard
              ticket={activeTicket}
              event={activeEvent}
              onDownload={() => alert('Đang chuẩn bị tải vé điện tử của bạn.')}
            />
          </div>
        </DetailDrawer>
      )}
    </div>
  );
}
