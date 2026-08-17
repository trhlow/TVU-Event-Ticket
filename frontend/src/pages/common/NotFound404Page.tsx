import { Link } from "react-router";
import { Compass } from "lucide-react";
import StatusPage from "../../components/common/StatusPage";

export default function NotFound404Page() {
  return (
    <StatusPage
      code="Lỗi 404"
      title="Không tìm thấy trang"
      description="Đường dẫn hiện tại không tồn tại hoặc đã được chuyển sang cấu trúc route khác."
      icon={Compass}
      action={
        <Link
          to="/"
          className="btn-press inline-flex h-11 w-full items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Về trang chủ
        </Link>
      }
    />
  );
}
