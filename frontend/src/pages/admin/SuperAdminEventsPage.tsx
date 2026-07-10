import React, { useMemo, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import Breadcrumb from '../../components/common/Breadcrumb';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { getEvents } from '../../data/mockEvents';
import { mockClubs } from '../../data/mockClubs';
import { Event } from '../../types/event';
import { formatDateTime } from '../../utils/formatDate';

export default function SuperAdminEventsPage() {
  const [clubId, setClubId] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');

  const events = useMemo(() => {
    return getEvents().filter((event) => {
      const matchesClub = clubId === 'ALL' || event.clubId === clubId;
      const matchesStatus = status === 'ALL' || event.status === status;
      const matchesQuery = event.title.toLowerCase().includes(query.toLowerCase().trim());
      return matchesClub && matchesStatus && matchesQuery;
    });
  }, [clubId, status, query]);

  const columns = [
    {
      header: 'Sự kiện',
      accessor: (event: Event) => (
        <div className="max-w-sm text-left">
          <p className="truncate text-sm font-black text-gray-950">{event.title}</p>
          <p className="mt-1 text-[11px] font-bold text-brand-600">{event.clubName}</p>
        </div>
      ),
    },
    {
      header: 'Thời gian',
      accessor: (event: Event) => <span className="text-xs font-bold text-gray-700">{formatDateTime(event.startAt)}</span>,
    },
    {
      header: 'Vé',
      accessor: (event: Event) => (
        <span className="font-mono text-xs font-black text-gray-900">{event.remainingTickets}/{event.capacity}</span>
      ),
    },
    {
      header: 'Trạng thái',
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
    {
      header: 'Xem',
      accessor: (event: Event) => (
        <Link
          to={`/admin/events/${event.id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-black text-gray-700 hover:bg-gray-50"
        >
          <Eye className="h-3.5 w-3.5" /> Chi tiết
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Sự kiện toàn trường' }]} />

      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">Sự kiện toàn trường</h2>
        <p className="text-sm font-medium text-gray-500">
          Theo dõi toàn bộ sự kiện của các CLB, trạng thái phát hành vé và quy mô đăng ký.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên sự kiện..."
            className="min-h-11 w-full rounded-xl border border-gray-200 pl-10 pr-3 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <select value={clubId} onChange={(e) => setClubId(e.target.value)} className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm font-bold">
          <option value="ALL">Tất cả CLB</option>
          {mockClubs.map((club) => (
            <option key={club.id} value={club.id}>{club.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 rounded-xl border border-gray-200 px-3 text-sm font-bold">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="OPEN">Đang mở đăng ký</option>
          <option value="UPCOMING">Sắp mở</option>
          <option value="FULL">Hết vé</option>
          <option value="CLOSED">Đã đóng</option>
          <option value="ENDED">Đã kết thúc</option>
        </select>
      </div>

      <DataTable data={events} columns={columns} searchPlaceholder="Lọc nhanh..." searchField="title" />
    </div>
  );
}
