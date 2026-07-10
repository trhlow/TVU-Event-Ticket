import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50 text-left min-h-[70vh]">
      <div className="max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-600 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-950 tracking-tight">403 - Quyền truy cập bị hạn chế</h1>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Bạn không có đủ phân quyền phù hợp để xem tài nguyên này. Vui lòng đăng nhập bằng tài khoản có vai trò được cấp quyền.
          </p>
        </div>
        <div className="pt-2 w-full">
          <Link
            to="/"
            className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại Trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
