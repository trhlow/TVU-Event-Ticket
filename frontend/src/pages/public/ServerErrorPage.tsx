import React from 'react';
import { Link } from 'react-router';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import StatusPage from '../../components/common/StatusPage';

export default function ServerErrorPage() {
  return (
    <StatusPage
      code="Lỗi 500"
      title="Lỗi máy chủ hệ thống"
      description="Đã xảy ra sự cố đột ngột trong quá trình kết nối dữ liệu. Vui lòng thử tải lại trang hoặc liên hệ quản trị viên nhà trường để được hỗ trợ."
      icon={AlertOctagon}
      tone="warning"
      action={
        <div className="flex w-full gap-2">
          <button
            onClick={() => window.location.reload()}
            className="btn-press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-control bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tải lại trang
          </button>
          <Link
            to="/"
            className="btn-press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-control border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Về trang chủ
          </Link>
        </div>
      }
    />
  );
}
