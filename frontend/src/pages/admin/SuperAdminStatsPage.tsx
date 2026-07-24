import React, { useEffect, useMemo, useState } from 'react';
import { Users, Landmark, Ticket, Calendar, ShieldCheck } from 'lucide-react';
import { getEvents } from '../../data/mockEvents';
import { getReservations } from '../../data/mockReservations';
import { getTickets } from '../../data/mockTickets';
import { mockClubs } from '../../data/mockClubs';
import PageHeader from '../../components/common/PageHeader';
import StatisticCard from '../../components/common/StatisticCard';
import BarChartCard from '../../components/charts/BarChartCard';
import DonutChartCard from '../../components/charts/DonutChartCard';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';
import DemoDataBadge from '../../components/common/DemoDataBadge';
import { SchoolWideOverview, statisticsService } from '../../services/statisticsService';
import { clubStatsService } from '../../services/clubStatsService';
import { ClubStatsSummary } from '../../types/clubStats';
import { apiConfig } from '../../services/apiClient';

const CLUB_STATS_PAGE_SIZE = 100;

export default function SuperAdminStatsPage() {
  const [overview, setOverview] = useState<SchoolWideOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [clubStats, setClubStats] = useState<ClubStatsSummary[] | null>(null);

  useEffect(() => {
    let mounted = true;
    statisticsService
      .overview()
      .then((result) => {
        if (mounted) setOverview(result);
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    clubStatsService
      .listSummaries({ page: 0, size: CLUB_STATS_PAGE_SIZE })
      .then((result) => {
        if (mounted) setClubStats(result.items);
      })
      .catch(() => {
        // Falls back to the demo per-club chart below when the per-club endpoint is unreachable.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const available = apiConfig.useDemoData ? true : overview !== null;

  const events = useMemo(() => getEvents(), []);
  const reservations = useMemo(() => getReservations(), []);
  const tickets = useMemo(() => getTickets(), []);

  const totalClubs = overview?.admin.totalClubs ?? mockClubs.length;
  const totalEvents = overview?.events.totalEvents ?? events.length;
  const totalReservations = reservations.length;
  const ticketsIssued = overview?.tickets.ticketsIssued ?? tickets.filter(t => t.status === 'VALID').length;
  const checkedInCount = overview?.tickets.checkedIn ?? tickets.filter(t => t.checkInStatus === 'CHECKED_IN').length;

  const checkinRate = overview?.tickets.checkInRate != null
    ? Math.round(overview.tickets.checkInRate * 100)
    : (ticketsIssued > 0 ? Math.round((checkedInCount / ticketsIssued) * 100) : 0);

  const clubStatsData = clubStats
    ? clubStats.map((c) => ({
        name: c.clubName.replace('Câu lạc bộ', 'CLB'),
        'Sự kiện': c.totalEvents,
        'Vé phát hành': c.ticketsIssued,
        'Đã check-in': c.checkedIn,
      }))
    : mockClubs.map(c => {
        const clubEvents = events.filter(e => e.clubId === c.id);
        const clubEventIds = clubEvents.map(e => e.id);
        const clubRes = reservations.filter(r => clubEventIds.includes(r.eventId));
        const clubTickets = tickets.filter(t => clubEventIds.includes(t.eventId));

        return {
          name: c.name.replace('Câu lạc bộ', 'CLB'),
          'Sự kiện': clubEvents.length,
          'Đăng ký': clubRes.length,
          'Đã check-in': clubTickets.filter(t => t.checkInStatus === 'CHECKED_IN').length
        };
      });

  const categories = Array.from(new Set(events.map(e => e.category)));
  const categoryStats = categories.map(cat => ({
    name: cat,
    value: events.filter(e => e.category === cat).length
  }));

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <PageHeader
        title="Thống kê toàn trường & phân tích hiệu quả"
        description="Báo cáo tổng hợp số liệu tương tác sự kiện, đăng ký, duyệt phát hành vé và tỷ lệ tham dự của sinh viên Đại học Trà Vinh."
      />

      {!available ? (
        <BackendPendingNotice
          title={loadError ? "Không thể tải thống kê toàn trường" : "Đang tải thống kê"}
          description={
            loadError
              ? "Không thể gọi API thống kê toàn trường (kiểm tra quyền SUPER_ADMIN hoặc kết nối backend)."
              : "Đang tải số liệu toàn trường từ backend."
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <DemoDataBadge />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatisticCard label="CLB Hoạt Động" value={totalClubs} icon={Landmark} />
            <StatisticCard label="Tổng Sự Kiện" value={totalEvents} icon={Calendar} color="warning" />
            <StatisticCard label="Đăng ký (Lượt)" value={totalReservations} icon={Users} />
            <StatisticCard label="Vé đã phát hành" value={ticketsIssued} icon={Ticket} color="primary" />
            <div className="col-span-2 md:col-span-1">
              <StatisticCard label="Tỷ Lệ Check-in" value={`${checkinRate}%`} icon={ShieldCheck} color="success" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BarChartCard
                title={
                  clubStats
                    ? "Tương quan Hoạt động & Mức độ Sinh viên tham gia theo từng Câu lạc bộ"
                    : "Tương quan Hoạt động & Mức độ Sinh viên tham gia theo từng Câu lạc bộ (dữ liệu demo cục bộ)"
                }
                xAxisKey="name"
                data={clubStatsData}
                dataKeys={
                  clubStats
                    ? [
                        { key: 'Sự kiện', name: 'Số sự kiện', color: '#3b82f6' },
                        { key: 'Vé phát hành', name: 'Vé phát hành', color: '#f59e0b' },
                        { key: 'Đã check-in', name: 'Điểm danh check-in', color: '#10b981' },
                      ]
                    : [
                        { key: 'Sự kiện', name: 'Số sự kiện', color: '#3b82f6' },
                        { key: 'Đăng ký', name: 'Đăng ký nhận vé', color: '#f59e0b' },
                        { key: 'Đã check-in', name: 'Điểm danh check-in', color: '#10b981' },
                      ]
                }
              />
            </div>

            <div className="lg:col-span-1">
              <DonutChartCard
                title="Cơ cấu Thể loại Sự kiện Toàn Trường"
                data={categoryStats}
                colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
