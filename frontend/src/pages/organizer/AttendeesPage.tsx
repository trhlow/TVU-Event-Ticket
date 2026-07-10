import React, { useState } from 'react';
import { Search, Download } from 'lucide-react';
import { getReservations } from '../../data/mockReservations';
import { getEvents } from '../../data/mockEvents';
import { getTickets } from '../../data/mockTickets';
import { getCurrentUser } from '../../data/mockAuth';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import Toast from '../../components/common/Toast';
import { formatDateTime } from '../../utils/formatDate';
import { Reservation } from '../../types/reservation';

type AttendeeRow = Reservation & {
  eventTitle: string;
  checkInStatus: string;
  checkInAt: string | null;
  ticketCode: string;
};

export default function AttendeesPage() {
  const currentUser = getCurrentUser();
  const events = getEvents().filter(e => e.clubId === currentUser.clubId);
  const eventIds = events.map(e => e.id);
  
  const allReservations = getReservations().filter(
    r => eventIds.includes(r.eventId) && r.status === 'APPROVED'
  );
  const tickets = getTickets();

  const [search, setSearch] = useState('');
  const [filterEvent, setFilterEvent] = useState('ALL');
  const [toastMsg, setToastMsg] = useState('');

  // Enhance registrations with checkin details
  const attendees: AttendeeRow[] = allReservations.map(res => {
    const event = events.find(e => e.id === res.eventId);
    const ticket = tickets.find(t => t.eventId === res.eventId && t.studentId === res.studentId);
    return {
      ...res,
      eventTitle: event?.title || 'Sự kiện ẩn',
      checkInStatus: ticket?.checkInStatus || 'PENDING',
      checkInAt: ticket?.checkInAt || null,
      ticketCode: ticket?.ticketCode || 'N/A'
    };
  });

  const filteredAttendees = attendees.filter(att => {
    const matchSearch = 
      att.studentName.toLowerCase().includes(search.toLowerCase()) ||
      att.mssv.includes(search) ||
      att.ticketCode.toLowerCase().includes(search.toLowerCase());
    
    const matchEvent = filterEvent === 'ALL' || att.eventId === filterEvent;

    return matchSearch && matchEvent;
  });

  const handleExportCSV = () => {
    setToastMsg('Đang chuẩn bị trích xuất danh sách người tham dự dưới dạng file CSV.');
  };

  const columns = [
    {
      header: 'Họ và tên',
      accessor: (att: AttendeeRow) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{att.studentName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{att.email}</span>
        </div>
      )
    },
    {
      header: 'MSSV / Lớp',
      accessor: (att: AttendeeRow) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-800 font-mono">{att.mssv}</span>
          <span className="text-[10px] text-gray-400 block">{att.className}</span>
        </div>
      )
    },
    {
      header: 'Sự Kiện Đăng Ký',
      accessor: (att: AttendeeRow) => (
        <span className="text-xs font-bold text-gray-700 block max-w-xs truncate" title={att.eventTitle}>
          {att.eventTitle}
        </span>
      )
    },
    {
      header: 'Mã Vé QR',
      accessor: (att: AttendeeRow) => (
        <span className="text-xs font-bold text-gray-900 font-mono block bg-gray-50 px-2 py-0.5 rounded border border-gray-100 w-fit">
          {att.ticketCode}
        </span>
      )
    },
    {
      header: 'Điểm Danh (Check-in)',
      accessor: (att: AttendeeRow) => (
        <div className="text-left">
          {att.checkInStatus === 'CHECKED_IN' ? (
            <div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded block w-fit">
                ĐÃ ĐIỂM DANH
              </span>
              <span className="text-[9px] text-gray-400 font-semibold block mt-0.5">Lúc: {att.checkInAt ? formatDateTime(att.checkInAt) : "Chưa ghi nhận"}</span>
            </div>
          ) : (
            <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded block w-fit">
              VẮNG MẶT / CHƯA QUÉT
            </span>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Người tham dự' }]} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-950 tracking-tight">Danh Sách Sinh Viên Tham Dự</h2>
          <p className="text-xs text-gray-500 font-semibold">Danh sách học viên, sinh viên đã đăng ký hợp lệ và trạng thái check-in chi tiết tại các sự kiện</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-brand-600/10"
        >
          <Download className="w-4 h-4" /> Xuất danh sách (Excel)
        </button>
      </div>

      {/* Filter Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tìm kiếm người tham dự</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Họ tên, MSSV, mã vé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Lọc theo sự kiện</label>
          <select 
            value={filterEvent} 
            onChange={(e) => setFilterEvent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-transparent focus:outline-hidden focus:border-brand-500"
          >
            <option value="ALL">Tất cả sự kiện</option>
            {events.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
        <DataTable 
          data={filteredAttendees}
          columns={columns}
          searchPlaceholder="Lọc nhanh danh sách..."
          searchField="studentName"
        />
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
