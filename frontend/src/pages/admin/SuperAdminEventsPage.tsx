import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';

const REQUIRED_ENDPOINTS = ['GET /admin/events'];

export default function SuperAdminEventsPage() {
  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Sự kiện toàn trường"
        description="Theo dõi toàn bộ sự kiện của các CLB, trạng thái phát hành vé và quy mô đăng ký."
      />

      <BackendPendingNotice
        description="Backend hiện chỉ có API sự kiện công khai (chỉ sự kiện OPEN) và API sự kiện của CLB đang đăng nhập (/events/mine, xác định club qua JWT) — chưa có API liệt kê sự kiện của mọi CLB dành cho Super Admin. Trang này sẽ hiển thị dữ liệu thật ngay khi endpoint bên dưới sẵn sàng."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
