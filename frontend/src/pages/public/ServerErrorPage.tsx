import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export default function ServerErrorPage() {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="enterprise-card flex w-full max-w-md flex-col items-center gap-6 p-8">
        <div className="icon-float grid h-16 w-16 place-items-center rounded-full border border-warning-100 bg-warning-50 text-warning-600 shadow-inner">
          <AlertOctagon className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-warning-600">Lỗi 500</p>
          <h1 className="tvu-page-title text-2xl">Lỗi máy chủ hệ thống</h1>
          <p className="text-sm font-medium leading-6 text-slate-500">
            Đã xảy ra sự cố đột ngột trong quá trình kết nối dữ liệu. Vui lòng thử tải lại trang hoặc liên hệ quản trị viên nhà trường để được hỗ trợ.
          </p>
        </div>
        <div className="flex w-full gap-2">
          <button
            onClick={() => window.location.reload()}
            className="btn-press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tải lại trang
          </button>
          <Link
            to="/"
            className="btn-press flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
