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
import { statisticsService } from '../../services/statisticsService';
import { apiConfig } from '../../services/apiClient';

const REQUIRED_ENDPOINTS = ['GET /admin/statistics/overview', 'GET /admin/statistics/clubs'];

export default function SuperAdminStatsPage() {
  const [available, setAvailable] = useState(apiConfig.useDemoData);

  useEffect(() => {
    statisticsService
      .assertSupported()
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false));
  }, []);

  const events = useMemo(() => getEvents(), []);
  const reservations = useMemo(() => getReservations(), []);
  const tickets = useMemo(() => getTickets(), []);

  const totalClubs = mockClubs.length;
  const totalEvents = events.length;
  const totalReservations = reservations.length;
  const activeTicketsCount = tickets.filter(t => t.status === 'VALID').length;
  const checkedInCount = tickets.filter(t => t.checkInStatus === 'CHECKED_IN').length;

  const checkinRate = activeTicketsCount > 0
    ? Math.round((checkedInCount / activeTicketsCount) * 100)
    : 0;

  const clubStatsData = mockClubs.map(c => {
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
          description="Backend chưa có API thống kê toàn trường theo CLB. Trang này sẽ hiển thị số liệu thật ngay khi endpoint bên dưới sẵn sàng."
          requiredEndpoints={REQUIRED_ENDPOINTS}
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
            <StatisticCard label="Vé đã phê duyệt" value={activeTicketsCount} icon={Ticket} color="primary" />
            <div className="col-span-2 md:col-span-1">
              <StatisticCard label="Tỷ Lệ Check-in" value={`${checkinRate}%`} icon={ShieldCheck} color="success" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BarChartCard
                title="Tương quan Hoạt động & Mức độ Sinh viên tham gia theo từng Câu lạc bộ"
                xAxisKey="name"
                data={clubStatsData}
                dataKeys={[
                  { key: 'Sự kiện', name: 'Số sự kiện', color: '#3b82f6' },
                  { key: 'Đăng ký', name: 'Đăng ký nhận vé', color: '#f59e0b' },
                  { key: 'Đã check-in', name: 'Điểm danh check-in', color: '#10b981' }
                ]}
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
