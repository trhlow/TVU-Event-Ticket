import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { getTickets } from '../../data/mockTickets';
import { getEvents } from '../../data/mockEvents';
import { getReservations } from '../../data/mockReservations';
import { getCurrentUser } from '../../data/mockAuth';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { formatDateTime } from '../../utils/formatDate';

export default function OrganizerTicketsPage() {
  const currentUser = getCurrentUser();
  const events = getEvents().filter(e => e.clubId === currentUser.clubId);
  const eventIds = events.map(e => e.id);
  
  const allTickets = getTickets().filter(t => eventIds.includes(t.eventId));
  const reservations = getReservations();

  const [search, setSearch] = useState('');
  const [filterEvent, setFilterEvent] = useState('ALL');
  const [filterCheckin, setFilterCheckin] = useState('ALL');

  // Enhance tickets with student name and event title
  const enhancedTickets = allTickets.map(t => {
    const event = events.find(e => e.id === t.eventId);
    // Find matching reservation to get student details
    const res = reservations.find(r => r.eventId === t.eventId && r.studentId === t.studentId);
    return {
      ...t,
      eventTitle: event?.title || 'Sự kiện ẩn',
      studentName: res?.studentName || 'Sinh viên ẩn',
      mssv: res?.mssv || 'N/A',
      className: res?.className || 'N/A'
    };
  });

  const filteredTickets = enhancedTickets.filter(t => {
    const matchSearch = 
      t.studentName.toLowerCase().includes(search.toLowerCase()) ||
      t.mssv.includes(search) ||
      t.ticketCode.toLowerCase().includes(search.toLowerCase());
    
    const matchEvent = filterEvent === 'ALL' || t.eventId === filterEvent;
    const matchCheckin = filterCheckin === 'ALL' || t.checkInStatus === filterCheckin;

    return matchSearch && matchEvent && matchCheckin;
  });

  const columns = [
    {
      header: 'Mã Vé / Ngày cấp',
      accessor: (tkt: any) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 font-mono tracking-wider block">{tkt.ticketCode}</span>
          <span className="text-[10px] text-gray-400 font-semibold block mt-0.5">Cấp: {formatDateTime(tkt.issuedAt)}</span>
        </div>
      )
    },
    {
      header: 'Người Sở Hữu',
      accessor: (tkt: any) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-900 block">{tkt.studentName}</span>
          <span className="text-[10px] text-gray-500 font-mono block">MSSV: {tkt.mssv} • Lớp: {tkt.className}</span>
        </div>
      )
    },
    {
      header: 'Sự Kiện',
      accessor: (tkt: any) => (
        <span className="text-xs font-bold text-gray-700 block max-w-xs truncate" title={tkt.eventTitle}>
          {tkt.eventTitle}
        </span>
      )
    },
    {
      header: 'Trạng Thái Vé',
      accessor: (tkt: any) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge type="ticket" status={tkt.status} />
          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
            tkt.checkInStatus === 'CHECKED_IN' 
              ? 'bg-emerald-50 text-emerald-700' 
              : 'bg-amber-50 text-amber-700'
          }`}>
            {tkt.checkInStatus === 'CHECKED_IN' ? 'ĐÃ CHECK-IN' : 'CHƯA CHECK-IN'}
          </span>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Quản lý vé' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Quản Lý Vé Đã Phát Hành</h2>
        <p className="text-xs text-gray-500 font-semibold">Theo dõi trạng thái, lịch sử check-in và thống kê vé điện tử của toàn bộ sự kiện thuộc câu lạc bộ</p>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tìm kiếm</label>
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

        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Lọc Check-in</label>
          <select 
            value={filterCheckin} 
            onChange={(e) => setFilterCheckin(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold bg-transparent focus:outline-hidden focus:border-brand-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chưa check-in</option>
            <option value="CHECKED_IN">Đã check-in</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
        <DataTable 
          data={filteredTickets}
          columns={columns}
          searchPlaceholder="Lọc nhanh danh sách..."
          searchField="studentName"
        />
      </div>
    </div>
  );
}
