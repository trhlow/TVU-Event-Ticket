import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, Calendar, FileText, Users } from 'lucide-react';
import Breadcrumb from '../../components/common/Breadcrumb';
import StatisticCard from '../../components/common/StatisticCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import BarChartCard from '../../components/charts/BarChartCard';
import { mockClubs } from '../../data/mockClubs';
import { mockUsers } from '../../data/mockUsers';
import { getEvents } from '../../data/mockEvents';
import { getReservations } from '../../data/mockReservations';
import { mockAuditLogs } from '../../data/mockAuditLogs';
import { Event } from '../../types/event';
import { formatDateTime } from '../../utils/formatDate';

type TabKey = 'overview' | 'members' | 'events' | 'stats' | 'logs';

export default function SuperAdminClubDetailPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const club = mockClubs.find((item) => item.id === clubId) || mockClubs[0];

  const events = useMemo(() => getEvents().filter((event) => event.clubId === club.id), [club.id]);
  const eventIds = events.map((event) => event.id);
  const organizers = mockUsers.filter((user) => user.role === 'ORGANIZER' && user.clubId === club.id);
  const reservations = getReservations().filter((reservation) => eventIds.includes(reservation.eventId));
  const logs = mockAuditLogs.slice(0, 6);

  const eventColumns = [
    {
      header: 'Sự kiện',
      accessor: (event: Event) => <span className="text-sm font-black text-gray-950">{event.title}</span>,
    },
    {
      header: 'Thời gian',
      accessor: (event: Event) => <span className="text-xs font-bold text-gray-600">{formatDateTime(event.startAt)}</span>,
    },
    {
      header: 'Vé',
      accessor: (event: Event) => <span className="font-mono text-xs font-black">{event.remainingTickets}/{event.capacity}</span>,
    },
    {
      header: 'Trạng thái',
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
  ];

  const chartData = events.map((event) => ({
    name: event.title.length > 18 ? `${event.title.slice(0, 18)}...` : event.title,
    'Đăng ký': reservations.filter((reservation) => reservation.eventId === event.id).length,
    'Sức chứa': event.capacity,
  }));

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Quản lý CLB', path: '/admin/clubs' }, { label: club.name }]} />

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-black text-brand-700">{club.code}</span>
            <h2 className="text-2xl font-black tracking-tight text-gray-950">{club.name}</h2>
            <p className="max-w-3xl text-sm font-medium leading-relaxed text-gray-500">{club.description}</p>
          </div>
          <StatusBadge type="user" status={club.status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED'} />
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
        {[
          ['overview', 'Tổng quan'],
          ['members', 'Thành viên'],
          ['events', 'Sự kiện'],
          ['stats', 'Thống kê'],
          ['logs', 'Nhật ký thao tác'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as TabKey)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-black ${
              activeTab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatisticCard label="Thành viên BTC" value={organizers.length} icon={Users} color="primary" />
          <StatisticCard label="Tổng sự kiện" value={events.length} icon={Calendar} color="success" />
          <StatisticCard label="Lượt đăng ký" value={reservations.length} icon={FileText} color="warning" />
          <StatisticCard label="Đang mở" value={events.filter((event) => event.status === 'OPEN').length} icon={Activity} color="success" />
        </div>
      )}

      {activeTab === 'members' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {organizers.map((user) => (
            <div key={user.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-base font-black text-gray-950">{user.fullName}</p>
              <p className="mt-1 text-sm font-semibold text-gray-500">{user.email}</p>
              <div className="mt-3"><StatusBadge type="user" status={user.status} /></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'events' && <DataTable data={events} columns={eventColumns} searchField="title" searchPlaceholder="Tìm sự kiện của CLB..." />}

      {activeTab === 'stats' && (
        <BarChartCard
          title="Tương quan đăng ký và sức chứa theo sự kiện"
          data={chartData}
          xAxisKey="name"
          dataKeys={[
            { key: 'Đăng ký', name: 'Lượt đăng ký', color: '#2563EB' },
            { key: 'Sức chứa', name: 'Sức chứa', color: '#00A896' },
          ]}
        />
      )}

      {activeTab === 'logs' && (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-gray-950">{log.action}</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">{log.actorName} · {formatDateTime(log.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
