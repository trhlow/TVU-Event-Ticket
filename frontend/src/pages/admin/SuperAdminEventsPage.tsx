import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Calendar } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import DataTable from '../../components/common/DataTable';
import { clubService } from '../../services/clubService';
import { eventService } from '../../services/eventService';
import { formatDateTime } from '../../utils/formatDate';
import { Club } from '../../types/club';
import { Event } from '../../types/event';

export default function SuperAdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [clubsById, setClubsById] = useState<Record<string, Club>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([eventService.listAllForAdmin(), clubService.listRemote()])
      .then(([allEvents, allClubs]) => {
        if (!mounted) return;
        setEvents(allEvents);
        setClubsById(Object.fromEntries(allClubs.map((club) => [club.id, club])));
      })
      .catch((error) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách sự kiện.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const columns = [
    {
      header: 'Sự kiện',
      accessor: (event: Event) => (
        <div>
          <p className="font-bold text-slate-950">{event.title}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-400">{formatDateTime(event.startAt)}</p>
        </div>
      ),
    },
    {
      header: 'CLB tổ chức',
      accessor: (event: Event) => (
        <Link to={`/admin/clubs/${event.clubId}?tab=events`} className="font-semibold text-brand-700 hover:underline">
          {clubsById[event.clubId]?.name || event.clubId}
        </Link>
      ),
    },
    {
      header: 'Trạng thái',
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
    {
      header: 'Vé',
      accessor: (event: Event) => (
        <span className="text-xs font-bold text-slate-500">
          {event.availabilityUnknown ? 'Không xác định' : `Còn ${event.remainingTickets}/${event.capacity}`}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Sự kiện toàn trường"
        description="Toàn bộ sự kiện của mọi CLB, bao gồm bản nháp, đang mở và đã đóng."
      />

      {isLoading ? (
        <LoadingSkeleton type="card" count={3} />
      ) : loadError ? (
        <EmptyState title="Không thể tải danh sách sự kiện" description={loadError} icon={Calendar} />
      ) : events.length === 0 ? (
        <EmptyState title="Chưa có sự kiện" description="Hệ thống chưa có sự kiện nào." icon={Calendar} />
      ) : (
        <DataTable data={events} columns={columns} searchPlaceholder="Tìm kiếm tên sự kiện..." searchField="title" />
      )}
    </div>
  );
}
