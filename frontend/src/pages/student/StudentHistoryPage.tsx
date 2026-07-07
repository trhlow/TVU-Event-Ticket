import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle, Clock, Search } from 'lucide-react';
import Breadcrumb from '../../components/common/Breadcrumb';
import StatisticCard from '../../components/common/StatisticCard';
import StatusBadge from '../../components/common/StatusBadge';
import { getCurrentUser } from '../../data/mockAuth';
import { getEvents } from '../../data/mockEvents';
import { getTickets } from '../../data/mockTickets';
import { formatDateTime } from '../../utils/formatDate';

export default function StudentHistoryPage() {
  const currentUser = getCurrentUser();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const rows = useMemo(() => {
    const events = getEvents();
    return getTickets()
      .filter((ticket) => ticket.studentId === currentUser.id)
      .map((ticket) => ({
        ticket,
        event: events.find((event) => event.id === ticket.eventId),
      }))
      .filter(({ event }) => Boolean(event))
      .filter(({ ticket, event }) => {
        const matchesQuery = event!.title.toLowerCase().includes(query.toLowerCase().trim());
        const matchesStatus = status === 'ALL' || ticket.checkInStatus === status;
        return matchesQuery && matchesStatus;
      });
  }, [currentUser.id, query, status]);

  const checkedInCount = rows.filter(({ ticket }) => ticket.checkInStatus === 'CHECKED_IN').length;

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Lịch sử tham gia' }]} />

      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">Lịch sử tham gia</h2>
        <p className="text-sm font-medium text-gray-500">
          Theo dõi các sự kiện đã được cấp vé, trạng thái điểm danh và thời gian check-in.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatisticCard label="Tổng vé đã cấp" value={rows.length} icon={CalendarDays} color="primary" />
        <StatisticCard label="Đã điểm danh" value={checkedInCount} icon={CheckCircle} color="success" />
        <StatisticCard label="Chưa điểm danh" value={Math.max(rows.length - checkedInCount, 0)} icon={Clock} color="warning" />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên sự kiện..."
            className="min-h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-700 focus:border-brand-500 focus:outline-none"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="CHECKED_IN">Đã điểm danh</option>
          <option value="PENDING">Chưa điểm danh</option>
        </select>
      </div>

      <div className="space-y-3">
        {rows.length > 0 ? (
          rows.map(({ ticket, event }) => (
            <article key={ticket.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-wider text-brand-600">{event!.clubName}</p>
                  <h3 className="truncate text-base font-black text-gray-950">{event!.title}</h3>
                  <p className="text-xs font-semibold text-gray-500">{formatDateTime(event!.startAt)} · {event!.location}</p>
                  {ticket.checkInAt && (
                    <p className="text-xs font-bold text-emerald-700">Điểm danh lúc {formatDateTime(ticket.checkInAt)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
                  <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-700">
                    {ticket.ticketCode}
                  </span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm font-bold text-gray-500">
            Không có lịch sử tham gia phù hợp với bộ lọc hiện tại.
          </div>
        )}
      </div>
    </div>
  );
}
