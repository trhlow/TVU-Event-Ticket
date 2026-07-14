import React from 'react';
import Breadcrumb from '../../components/common/Breadcrumb';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';

const REQUIRED_ENDPOINTS = ['GET /organizer/statistics', 'GET /organizer/statistics/events'];

export default function ClubReportPage() {
  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb items={[{ label: 'Ban tổ chức', path: '/organizer' }, { label: 'Báo cáo CLB' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Báo Cáo & Thống Kê Hoạt Động CLB</h2>
        <p className="text-xs text-gray-500 font-semibold">Phân tích hiệu quả truyền thông sự kiện, tỷ lệ phê duyệt và mức độ sinh viên tham gia điểm danh thực tế</p>
      </div>

      <BackendPendingNotice
        description="Backend chưa có API tổng hợp thống kê theo CLB (số đăng ký, tỷ lệ duyệt, tỷ lệ check-in theo từng sự kiện). Trang này sẽ hiển thị số liệu thật ngay khi endpoint bên dưới sẵn sàng — xem danh sách đăng ký chi tiết tại trang Duyệt đăng ký."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
