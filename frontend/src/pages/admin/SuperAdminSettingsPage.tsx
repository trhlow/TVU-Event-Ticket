import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import BackendPendingNotice from '../../components/common/BackendPendingNotice';

const REQUIRED_ENDPOINTS = ['GET /admin/settings', 'PUT /admin/settings', 'GET /admin/system-health'];

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6 text-left animate-fade-in">
      <PageHeader
        title="Cấu hình & thiết lập hệ thống"
        description="Điều chỉnh thông số vận hành, chính sách hạn ngạch vé điện tử, tên miền và bảo mật dữ liệu."
      />

      <BackendPendingNotice
        description="Backend chưa có API đọc/ghi cấu hình hệ thống hay API trạng thái hạ tầng thật. Trang này không hiển thị số liệu hạ tầng giả — sẽ nối cấu hình và giám sát thật ngay khi các endpoint bên dưới sẵn sàng."
        requiredEndpoints={REQUIRED_ENDPOINTS}
      />
    </div>
  );
}
