import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle, FileText, Ticket, Users } from 'lucide-react';
import Breadcrumb from '../../components/common/Breadcrumb';
import StatisticCard from '../../components/common/StatisticCard';
import BarChartCard from '../../components/charts/BarChartCard';
import DonutChartCard from '../../components/charts/DonutChartCard';
import { getEvents } from '../../data/mockEvents';
import { getReservations } from '../../data/mockReservations';
import { getTickets } from '../../data/mockTickets';

export default function OrganizerEventStatsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const events = getEvents();
  const event = events.find((item) => item.id === eventId) || events[0];
  const reservations = getReservations().filter((item) => item.eventId === event?.id);
  const tickets = getTickets().filter((item) => item.eventId === event?.id);

  if (!event) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm font-bold text-gray-500">
        Không tìm thấy sự kiện để thống kê.
      </div>
    );
  }

  const pending = reservations.filter((item) => item.status === 'PENDING').length;
  const approved = reservations.filter((item) => item.status === 'APPROVED').length;
  const rejected = reservations.filter((item) => item.status === 'REJECTED').length;
  const checkedIn = tickets.filter((item) => item.checkInStatus === 'CHECKED_IN').length;
  const checkInRate = approved > 0 ? Math.round((checkedIn / approved) * 100) : 0;

  const dailyData = [
    { name: '5 ngày trước', 'Đăng ký': Math.max(reservations.length - 8, 0), 'Điểm danh': Math.max(checkedIn - 4, 0) },
    { name: '4 ngày trước', 'Đăng ký': Math.max(reservations.length - 6, 0), 'Điểm danh': Math.max(checkedIn - 3, 0) },
    { name: '3 ngày trước', 'Đăng ký': Math.max(reservations.length - 4, 0), 'Điểm danh': Math.max(checkedIn - 2, 0) },
    { name: '2 ngày trước', 'Đăng ký': Math.max(reservations.length - 2, 0), 'Điểm danh': Math.max(checkedIn - 1, 0) },
    { name: 'Hôm nay', 'Đăng ký': reservations.length, 'Điểm danh': checkedIn },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Thống kê sự kiện' }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-gray-950">Thống kê sự kiện</h2>
          <p className="max-w-3xl text-sm font-medium text-gray-500">{event.title}</p>
        </div>
        <Link
          to={`/organizer/events/${event.id}/check-in`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700"
        >
          <Ticket className="mr-2 h-4 w-4" /> Đi tới quét QR
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatisticCard label="Tổng đăng ký" value={reservations.length} icon={FileText} color="primary" />
        <StatisticCard label="Chờ duyệt" value={pending} icon={Users} color="warning" />
        <StatisticCard label="Đã duyệt" value={approved} icon={CheckCircle} color="success" />
        <StatisticCard label="Từ chối" value={rejected} icon={BarChart3} color="danger" />
        <StatisticCard label="Tỷ lệ điểm danh" value={`${checkInRate}%`} icon={Ticket} color="primary" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BarChartCard
            title="Đăng ký và điểm danh theo thời gian"
            data={dailyData}
            xAxisKey="name"
            dataKeys={[
              { key: 'Đăng ký', name: 'Lượt đăng ký', color: '#2563EB' },
              { key: 'Điểm danh', name: 'Đã điểm danh', color: '#00A896' },
            ]}
          />
        </div>
        <DonutChartCard
          title="Tỷ lệ xử lý đăng ký"
          data={[
            { name: 'Chờ duyệt', value: pending || 0 },
            { name: 'Đã duyệt', value: approved || 0 },
            { name: 'Từ chối', value: rejected || 0 },
          ]}
          colors={['#F59E0B', '#10B981', '#EF4444']}
        />
      </div>
    </div>
  );
}
