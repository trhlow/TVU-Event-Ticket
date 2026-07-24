import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { Club } from '../../types/club';
import { User } from '../../types/user';
import { ClubStatsDetail } from '../../types/clubStats';

const EVENT_STATUS_LABELS: Record<string, string> = { DRAFT: 'Bản nháp', OPEN: 'Đang mở', CLOSED: 'Đã đóng' };

type TabKey = 'overview' | 'members' | 'events' | 'stats' | 'logs';

const TABS: Array<[TabKey, string]> = [
  ['overview', 'Tổng quan'],
  ['members', 'Thành viên'],
  ['events', 'Sự kiện'],
  ['stats', 'Thống kê'],
  ['logs', 'Nhật ký thao tác'],
];

export default function SuperAdminClubDetailPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [club, setClub] = useState<Club | null>(null);
  const [organizers, setOrganizers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<ClubStatsDetail | null>(null);
  const [statsError, setStatsError] = useState(false);

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
        eyebrow={club.code}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatisticCard label="Thành viên BTC" value={organizers.length} icon={Users} color="primary" />
          <StatisticCard label="Tài khoản đang hoạt động" value={organizers.filter((user) => user.status === 'ACTIVE').length} icon={Activity} color="success" />
          {stats ? (
            <>
              <StatisticCard label="Tổng sự kiện" value={stats.summary.totalEvents} icon={Calendar} color="warning" />
              <StatisticCard label="Vé đã phát hành" value={stats.summary.ticketsIssued} icon={Ticket} />
            </>
          ) : (
            <div className="md:col-span-2">
              <BackendPendingNotice
                title={statsError ? 'Không thể tải thống kê CLB' : 'Đang tải thống kê CLB'}
                description={
                  statsError
                    ? 'Không thể gọi API thống kê CLB (kiểm tra quyền SUPER_ADMIN hoặc kết nối backend).'
                    : 'Đang tải số sự kiện, vé phát hành và tỷ lệ check-in của CLB.'
                }
              />
            </div>
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
              <div key={user.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-base font-black text-gray-950">{user.fullName}</p>
                <p className="mt-1 text-sm font-semibold text-gray-500">{user.email}</p>
                <div className="mt-3"><StatusBadge type="user" status={user.status} /></div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <BackendPendingNotice
          description="Backend chưa có API liệt kê sự kiện của một CLB cụ thể cho Super Admin (API hiện có chỉ trả về sự kiện của CLB đang đăng nhập)."
          requiredEndpoints={['GET /admin/clubs/{clubId}/events']}
        />
      )}

      {activeTab === 'stats' && (
        stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatisticCard label="Tổng sự kiện" value={stats.summary.totalEvents} icon={Calendar} color="warning" />
              <StatisticCard label="Vé đã phát hành" value={stats.summary.ticketsIssued} icon={Ticket} color="primary" />
              <StatisticCard
                label="Tỷ lệ check-in"
                value={stats.summary.checkInRate != null ? `${Math.round(stats.summary.checkInRate * 100)}%` : 'Chưa có dữ liệu'}
                icon={ShieldCheck}
                color="success"
              />
            </div>

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
          </div>
        ) : (
          <BackendPendingNotice
            title={statsError ? 'Không thể tải thống kê CLB' : 'Đang tải thống kê CLB'}
            description={
              statsError
                ? 'Không thể gọi API thống kê CLB (kiểm tra quyền SUPER_ADMIN hoặc kết nối backend).'
                : 'Đang tải biểu đồ hoạt động 30 ngày gần nhất của CLB.'
            }
          />
        )
      )}

      {activeTab === 'logs' && (
        <BackendPendingNotice
          description="Backend ghi nhận audit log nội bộ nhưng chưa có API đọc nhật ký lọc theo CLB."
          requiredEndpoints={['GET /admin/audit-logs?clubId={clubId}']}
        />
      )}
    </div>
  );
}
