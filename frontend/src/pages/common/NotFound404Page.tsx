import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound404Page() {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="enterprise-card flex w-full max-w-md flex-col items-center gap-6 p-8">
        <div className="grid h-16 w-16 place-items-center rounded-full border border-info-100 bg-info-50 text-brand-700">
          <Compass className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-600">Lỗi 404</p>
          <h1 className="tvu-page-title text-2xl">Không tìm thấy trang</h1>
          <p className="text-sm font-medium leading-6 text-slate-500">
            Đường dẫn hiện tại không tồn tại hoặc đã được chuyển sang cấu trúc route khác.
          </p>
        </div>
        <Link
          to="/"
          className="btn-press inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
