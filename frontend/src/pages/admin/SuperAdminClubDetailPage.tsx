import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Activity, Calendar, ShieldCheck, Ticket, Users } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatisticCard from '../../components/common/StatisticCard';
import StatusBadge from '../../components/common/StatusBadge';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import DonutChartCard from '../../components/charts/DonutChartCard';
import LineChartCard from '../../components/charts/LineChartCard';
import { clubService } from '../../services/clubService';
import { userService } from '../../services/userService';
import { clubStatsService } from '../../services/clubStatsService';
import { eventService } from '../../services/eventService';
import { formatDateTime } from '../../utils/formatDate';
import { Club } from '../../types/club';
import { User } from '../../types/user';
import { ClubStatsDetail } from '../../types/clubStats';
import { Event } from '../../types/event';

const EVENT_STATUS_LABELS: Record<string, string> = { DRAFT: 'Bản nháp', OPEN: 'Đang mở', CLOSED: 'Đã đóng' };

type TabKey = 'overview' | 'members' | 'events';

const TABS: Array<[TabKey, string]> = [
  ['overview', 'Tổng quan'],
  ['members', 'Thành viên'],
  ['events', 'Sự kiện'],
];

export default function SuperAdminClubDetailPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey | null) || 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(TABS.some(([key]) => key === initialTab) ? initialTab : 'overview');
  const [club, setClub] = useState<Club | null>(null);
  const [organizers, setOrganizers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<ClubStatsDetail | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [clubEvents, setClubEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');

  useEffect(() => {
    if (!clubId) return;
    let mounted = true;
    setIsLoading(true);
    Promise.all([clubService.getByIdRemote(clubId), userService.listOrganizersRemote()])
      .then(([clubResult, allOrganizers]) => {
        if (!mounted) return;
        setClub(clubResult || null);
        setOrganizers(allOrganizers.filter((user) => user.clubId === clubId));
      })
      .catch((error) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'Không thể tải thông tin CLB.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    let mounted = true;
    setEventsLoading(true);
    eventService
      .listAllForAdmin(clubId)
      .then((allEvents) => {
        if (mounted) setClubEvents(allEvents);
      })
      .catch((error) => {
        if (mounted) setEventsError(error instanceof Error ? error.message : 'Không thể tải sự kiện của CLB.');
      })
      .finally(() => {
        if (mounted) setEventsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [clubId]);

  useEffect(() => {
    if (!clubId) return;
    let mounted = true;
    clubStatsService
      .getDetail(clubId)
      .then((result) => {
        if (mounted) setStats(result);
      })
      .catch(() => {
        if (mounted) setStatsError(true);
      });
    return () => {
      mounted = false;
    };
  }, [clubId]);

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <LoadingSkeleton type="card" count={3} />
      </div>
    );
  }

  if (loadError || !club) {
    return (
      <BackendPendingNotice
        title="Không thể tải thông tin CLB"
        description={loadError || 'Không tìm thấy CLB được yêu cầu.'}
      />
    );
  }

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title={club.name}
        description={club.description || 'Chưa có mô tả.'}
        actions={<StatusBadge type="user" status={club.status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED'} />}
      />

      <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-black ${
              activeTab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatisticCard label="Thành viên BTC" value={organizers.length} icon={Users} color="primary" />
            <StatisticCard label="Tài khoản đang hoạt động" value={organizers.filter((user) => user.status === 'ACTIVE').length} icon={Activity} color="success" />
            {stats && (
              <>
                <StatisticCard label="Tổng sự kiện" value={stats.summary.totalEvents} icon={Calendar} color="warning" />
                <StatisticCard label="Vé đã phát hành" value={stats.summary.ticketsIssued} icon={Ticket} />
                <StatisticCard
                  label="Tỷ lệ check-in"
                  value={stats.summary.checkInRate != null ? `${Math.round(stats.summary.checkInRate * 100)}%` : 'Chưa có dữ liệu'}
                  icon={ShieldCheck}
                  color="success"
                />
              </>
            )}
          </div>

          {stats ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <LineChartCard
                  title="Vé phát hành & Check-in 30 ngày gần nhất"
                  xAxisKey="date"
                  data={stats.last30Days.map((point) => ({
                    date: point.date.slice(5),
                    'Vé phát hành': point.ticketsIssued,
                    'Check-in': point.checkedIn,
                  }))}
                  dataKeys={[
                    { key: 'Vé phát hành', name: 'Vé phát hành', color: '#3b82f6' },
                    { key: 'Check-in', name: 'Check-in', color: '#10b981' },
                  ]}
                />
              </div>
              <div className="lg:col-span-1">
                <DonutChartCard
                  title="Cơ cấu trạng thái sự kiện"
                  data={Object.entries(stats.summary.eventsByStatus).map(([status, value]) => ({
                    name: EVENT_STATUS_LABELS[status] || status,
                    value,
                  }))}
                  colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444']}
                />
              </div>
            </div>
          ) : (
            <BackendPendingNotice
              title={statsError ? 'Không thể tải thống kê CLB' : 'Đang tải thống kê CLB'}
              description={
                statsError
                  ? 'Không thể tải thống kê CLB. Vui lòng kiểm tra quyền truy cập hoặc kết nối máy chủ.'
                  : 'Đang tải số sự kiện, vé phát hành, tỷ lệ check-in và biểu đồ hoạt động 30 ngày gần nhất của CLB.'
              }
            />
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {organizers.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState title="Chưa có thành viên" description="CLB chưa có tài khoản Ban tổ chức nào." icon={Users} />
            </div>
          ) : (
            organizers.map((user) => (
              <div key={user.id} className="rounded-card border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-base font-black text-gray-950">{user.fullName}</p>
                <p className="mt-1 text-sm font-semibold text-gray-500">{user.email}</p>
                <div className="mt-3"><StatusBadge type="user" status={user.status} /></div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'events' && (
        eventsLoading ? (
          <LoadingSkeleton type="card" count={2} />
        ) : eventsError ? (
          <BackendPendingNotice title="Không thể tải sự kiện của CLB" description={eventsError} />
        ) : clubEvents.length === 0 ? (
          <EmptyState title="Chưa có sự kiện" description="CLB này chưa có sự kiện nào." icon={Calendar} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {clubEvents.map((event) => (
                <div key={event.id} className="rounded-card border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge type="event" status={event.status} />
                    <span className="text-xs font-bold text-slate-500">Còn {event.remainingTickets}/{event.capacity} vé</span>
                  </div>
                  <p className="mt-3 text-base font-black text-gray-950">{event.title}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{formatDateTime(event.startAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )
      )}

    </div>
  );
}
