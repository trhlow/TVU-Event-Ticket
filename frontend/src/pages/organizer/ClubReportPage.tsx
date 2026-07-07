import React from 'react';
import { BarChart3, Users, Ticket, CheckCircle } from 'lucide-react';
import { getEvents } from '../../data/mockEvents';
import { getReservations } from '../../data/mockReservations';
import { getTickets } from '../../data/mockTickets';
import { getCurrentUser } from '../../data/mockAuth';
import Breadcrumb from '../../components/common/Breadcrumb';
import BarChartCard from '../../components/charts/BarChartCard';
import DonutChartCard from '../../components/charts/DonutChartCard';

export default function ClubReportPage() {
  const currentUser = getCurrentUser();
  const events = getEvents().filter(e => e.clubId === currentUser.clubId);
  const eventIds = events.map(e => e.id);
  
  const reservations = getReservations().filter(r => eventIds.includes(r.eventId));
  const tickets = getTickets().filter(t => eventIds.includes(t.eventId));

  // 1. Stats summary
  const totalEvents = events.length;
  const totalReservations = reservations.length;
  const approvedReservations = reservations.filter(r => r.status === 'APPROVED').length;
  const checkedInTickets = tickets.filter(t => t.checkInStatus === 'CHECKED_IN').length;
  
  const checkinRate = approvedReservations > 0 
    ? Math.round((checkedInTickets / approvedReservations) * 100) 
    : 0;

  // 2. Data for Events and Registration/Checkin bar chart
  const eventMetricsData = events.map(e => {
    const eventRes = reservations.filter(r => r.eventId === e.id);
    const eventTickets = tickets.filter(t => t.eventId === e.id);
    return {
      name: e.title.length > 20 ? e.title.substring(0, 17) + '...' : e.title,
      'Đăng ký': eventRes.length,
      'Đã duyệt': eventRes.filter(r => r.status === 'APPROVED').length,
      'Đã check-in': eventTickets.filter(t => t.checkInStatus === 'CHECKED_IN').length,
    };
  });

  // 3. Category distribution (Donut chart data)
  const categories = Array.from(new Set(events.map(e => e.category)));
  const categoryData = categories.map(cat => {
    return {
      name: cat,
      value: events.filter(e => e.category === cat).length
    };
  });

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Báo cáo CLB' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Báo Cáo & Thống Kê Hoạt Động CLB</h2>
        <p className="text-xs text-gray-500 font-semibold">Phân tích hiệu quả truyền thông sự kiện, tỷ lệ phê duyệt và mức độ sinh viên tham gia điểm danh thực tế</p>
      </div>

      {/* Core KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 flex-shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">Tổng sự kiện</span>
            <span className="text-lg font-black text-gray-950 block mt-0.5">{totalEvents}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">Lượt đăng ký</span>
            <span className="text-lg font-black text-gray-950 block mt-0.5">{totalReservations}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">Vé đã duyệt cấp</span>
            <span className="text-lg font-black text-gray-950 block mt-0.5">{approvedReservations}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">Tỷ lệ Check-in</span>
            <span className="text-lg font-black text-gray-950 block mt-0.5">{checkinRate}%</span>
          </div>
        </div>
      </div>

      {/* Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main metrics comparisons bar chart */}
        <div className="lg:col-span-2">
          <BarChartCard 
            title="Tương quan Đăng ký, Phê duyệt & Điểm danh theo Sự kiện"
            xAxisKey="name"
            data={eventMetricsData}
            dataKeys={[
              { key: 'Đăng ký', name: 'Lượt đăng ký', color: '#f59e0b' },
              { key: 'Đã duyệt', name: 'Đã duyệt cấp vé', color: '#3b82f6' },
              { key: 'Đã check-in', name: 'Thực tế tham gia', color: '#10b981' }
            ]}
          />
        </div>

        {/* Category distribution donut chart */}
        <div className="lg:col-span-1">
          <DonutChartCard 
            title="Cơ cấu Thể loại Sự kiện của CLB"
            data={categoryData}
            colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']}
          />
        </div>
      </div>
    </div>
  );
}
