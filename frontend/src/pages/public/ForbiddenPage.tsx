import React from 'react';
import { Link } from 'react-router';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import StatusPage from '../../components/common/StatusPage';

export default function ForbiddenPage() {
  return (
    <StatusPage
      code="Lỗi 403"
      title="Quyền truy cập bị hạn chế"
      description="Bạn không có đủ phân quyền phù hợp để xem tài nguyên này. Vui lòng đăng nhập bằng tài khoản có vai trò được cấp quyền."
      icon={ShieldAlert}
      tone="danger"
      action={
        <Link
          to="/"
          className="btn-press inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-control bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quay lại trang chủ
        </Link>
      }
    />
  );
}
