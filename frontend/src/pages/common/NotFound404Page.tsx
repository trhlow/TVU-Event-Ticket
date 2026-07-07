import { Link } from "react-router-dom";

export default function NotFound404Page() {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-5">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 text-gray-500 text-2xl font-black mx-auto">
        404
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-gray-950 tracking-tight">
          Không tìm thấy trang
        </h2>
        <p className="text-sm text-gray-600 font-medium leading-relaxed">
          Đường dẫn hiện tại không tồn tại hoặc đã được chuyển sang cấu trúc route
          khác.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-700 transition-colors"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
