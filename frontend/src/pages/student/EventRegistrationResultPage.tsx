import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Calendar,
  MapPin,
  ListChecks,
} from "lucide-react";
import { getReservations } from "../../data/mockReservations";
import { mockEvents } from "../../data/mockEvents";
import { formatDateTime } from "../../utils/formatDate";
import Breadcrumb from "../../components/common/Breadcrumb";

export default function EventRegistrationResultPage() {
  const { reservationId } = useParams<{ reservationId: string }>();

  const reservation = getReservations().find((r) => r.id === reservationId);
  const event = reservation
    ? mockEvents.find((e) => e.id === reservation.eventId)
    : null;

  if (!reservationId) {
    return (
      <div className="space-y-6 text-left max-w-2xl mx-auto">
        <Breadcrumb
          items={[
            { label: "Sinh viên", path: "/student/home" },
            { label: "Đăng ký sự kiện" },
            { label: "Kết quả đăng ký" },
          ]}
        />

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-5 text-center">
          <div className="w-16 h-16 mx-auto bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-gray-950 tracking-tight">
              Đăng ký đã được ghi nhận
            </h2>
            <p className="text-xs text-gray-500 font-semibold leading-relaxed">
              Đơn đăng ký của bạn đã được gửi tới ban tổ chức và đang chờ duyệt. Bạn
              có thể theo dõi trạng thái trong mục đăng ký của tôi.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Link
              to="/student/registrations"
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold transition-colors"
            >
              Xem đăng ký của tôi
            </Link>
            <Link
              to="/student/events"
              className="px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition-colors"
            >
              Tiếp tục xem sự kiện
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!reservation || !event) {
    return (
      <div className="py-12 text-center text-gray-400 font-bold space-y-4">
        <p>Đơn đăng ký không tìm thấy hoặc chưa được khởi tạo.</p>
        <Link
          to="/student/home"
          className="text-brand-600 hover:underline"
        >
          Quay lại Trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-2xl mx-auto">
      <Breadcrumb
        items={[
          { label: "Sinh viên", path: "/student/home" },
          { label: "Sự kiện" },
          { label: "Kết quả đăng ký" },
        ]}
      />

      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6 text-center flex flex-col items-center">
        {/* Animated Green Circle Checkmark */}
        <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-inner">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-black text-gray-950 tracking-tight">
            Đăng Ký Thành Công!
          </h2>
          <p className="text-xs text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">
            Đơn của bạn đã được chuyển đến ban điều hành{" "}
            <span className="text-brand-600 font-extrabold">{event.clubName}</span>{" "}
            để kiểm duyệt hồ sơ.
          </p>
        </div>

        {/* Recap card */}
        <div className="w-full bg-gray-50 rounded-2xl p-5 border border-gray-200/60 text-left space-y-3.5">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
            Phiếu đăng ký số: #{reservation.id}
          </span>
          <div className="space-y-1.5">
            <h4 className="text-sm font-black text-gray-900 leading-snug">
              {event.title}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-gray-600 pt-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{formatDateTime(event.startAt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="truncate">{event.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Helpful details */}
        <div className="text-[11px] text-gray-500 font-semibold leading-relaxed max-w-sm text-center space-y-1">
          <p>
            Mã vé QR sẽ tự động hiển thị trong mục{" "}
            <span className="font-extrabold text-brand-600">"Ví Vé"</span> ngay khi
            Ban tổ chức CLB phê duyệt phiếu đăng ký của bạn.
          </p>
        </div>

        {/* Action Link Row */}
        <div className="pt-4 flex flex-col sm:flex-row gap-2 w-full">
          <Link
            to="/student/registrations"
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ListChecks className="w-4 h-4" /> Xem lịch sử đăng ký
          </Link>
          <Link
            to="/student/home"
            className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
