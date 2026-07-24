import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';

const REQUIRED_ENDPOINTS = ['GET /tickets/me/history'];

export default function StudentHistoryPage() {
  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Lịch sử tham gia"
        description="Theo dõi các sự kiện đã được cấp vé, trạng thái điểm danh và thời gian check-in."
      />

      <BackendPendingNotice
        description="Backend hiện chưa có API trả trạng thái điểm danh (đã check-in hay chưa) và thời gian check-in cho sinh viên — API vé hiện có (/reservations/me) không bao gồm dữ liệu này. Trang sẽ hiển thị lịch sử thật ngay khi endpoint bên dưới sẵn sàng."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
