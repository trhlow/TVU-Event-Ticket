import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';

const REQUIRED_ENDPOINTS = ['GET /organizer/statistics', 'GET /organizer/statistics/events'];

export default function ClubReportPage() {
  return (
    <div className="space-y-6 text-left animate-fade-in">
      <PageHeader
        title="Báo cáo & thống kê hoạt động CLB"
        description="Phân tích hiệu quả truyền thông sự kiện, tỷ lệ phê duyệt và mức độ sinh viên tham gia điểm danh thực tế."
      />

      <BackendPendingNotice
        description="Backend chưa có API tổng hợp thống kê theo CLB (số đăng ký, tỷ lệ duyệt, tỷ lệ check-in theo từng sự kiện). Trang này sẽ hiển thị số liệu thật ngay khi endpoint bên dưới sẵn sàng — xem danh sách đăng ký chi tiết tại trang Duyệt đăng ký."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
