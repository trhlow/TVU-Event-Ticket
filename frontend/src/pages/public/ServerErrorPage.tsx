import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export default function ServerErrorPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50 text-left min-h-[70vh]">
      <div className="max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center text-amber-600 shadow-inner">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-950 tracking-tight">500 - Lỗi máy chủ hệ thống</h1>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Đã xảy ra sự cố đột ngột trong quá trình kết nối dữ liệu. Vui lòng thử tải lại trang hoặc liên hệ quản trị viên nhà trường để được hỗ trợ.
          </p>
        </div>
        <div className="pt-2 w-full flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Tải lại trang
          </button>
          <Link
            to="/"
            className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Về Trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
