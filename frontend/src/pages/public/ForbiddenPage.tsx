import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="enterprise-card flex w-full max-w-md flex-col items-center gap-6 p-8">
        <div className="icon-float grid h-16 w-16 place-items-center rounded-full border border-danger-100 bg-danger-50 text-danger-600 shadow-inner">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-danger-600">Lỗi 403</p>
          <h1 className="tvu-page-title text-2xl">Quyền truy cập bị hạn chế</h1>
          <p className="text-sm font-medium leading-6 text-slate-500">
            Bạn không có đủ phân quyền phù hợp để xem tài nguyên này. Vui lòng đăng nhập bằng tài khoản có vai trò được cấp quyền.
          </p>
        </div>
        <Link
          to="/"
          className="btn-press inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quay lại trang chủ
        </Link>
      </div>
    </div>
  );
}
