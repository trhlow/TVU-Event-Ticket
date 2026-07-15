import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Calendar, MapPin, ListChecks } from "lucide-react";
import { requireCurrentUser } from "../../state/authSession";
import { registrationService } from "../../services/registrationService";
import { formatDateTime } from "../../utils/formatDate";
import PageHeader from "../../components/common/PageHeader";
import { Reservation } from "../../types/reservation";

export default function EventRegistrationResultPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const currentUser = requireCurrentUser();
  const [reservation, setReservation] = useState<Reservation | null | undefined>(undefined);

  useEffect(() => {
    if (!reservationId) return;
    let mounted = true;
    registrationService
      .listByStudentRemote(currentUser.id)
      .then((items) => {
        if (mounted) setReservation(items.find((item) => item.id === reservationId) || null);
      })
      .catch(() => {
        if (mounted) setReservation(null);
      });
    return () => {
      mounted = false;
    };
  }, [reservationId, currentUser.id]);

  if (!reservationId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-left">
        <PageHeader
          breadcrumb={[{ label: "Sinh viên", path: "/student/home" }, { label: "Đăng ký sự kiện" }, { label: "Kết quả đăng ký" }]}
          title="Đăng ký đã được ghi nhận"
        />

        <div className="enterprise-card space-y-5 p-8 text-center">
          <div className="icon-float mx-auto grid h-16 w-16 place-items-center rounded-full border border-success-100 bg-success-50 text-success-600">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold leading-relaxed text-slate-500">
            Đơn đăng ký của bạn đã được gửi tới ban tổ chức và đang chờ duyệt. Bạn có thể theo dõi trạng thái trong mục đăng ký của tôi.
          </p>
          <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
            <Link to="/student/registrations" className="btn-press rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-700">
              Xem đăng ký của tôi
            </Link>
            <Link to="/student/events" className="btn-press rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              Tiếp tục xem sự kiện
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (reservation === undefined) {
    return <div className="py-12 text-center text-sm font-bold text-slate-500">Đang tải kết quả đăng ký...</div>;
  }

  if (!reservation) {
    return (
      <div className="space-y-4 py-12 text-center font-bold text-slate-400">
        <p>Không tìm thấy đơn đăng ký này trong tài khoản của bạn.</p>
        <Link to="/student/home" className="text-brand-600 hover:underline">
          Quay lại trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Sinh viên", path: "/student/home" }, { label: "Sự kiện" }, { label: "Kết quả đăng ký" }]}
        title="Đăng ký thành công"
      />

      <div className="enterprise-card flex flex-col items-center space-y-6 p-8 text-center">
        <div className="icon-float grid h-16 w-16 place-items-center rounded-full border border-success-100 bg-success-50 text-success-600 shadow-inner">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </div>

        <p className="mx-auto max-w-sm text-xs font-semibold leading-relaxed text-slate-500">
          Đơn của bạn đã được ghi nhận và chuyển đến ban tổ chức để kiểm duyệt hồ sơ.
        </p>

        <div className="w-full space-y-3.5 rounded-2xl border border-slate-200/60 bg-slate-50 p-5 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phiếu đăng ký số: #{reservation.id}</span>
          <div className="space-y-1.5">
            <h4 className="text-sm font-black leading-snug text-slate-900">{reservation.eventTitle || "Sự kiện đang cập nhật thông tin"}</h4>
            <div className="grid grid-cols-1 gap-2 pt-1 text-xs font-semibold text-slate-600 sm:grid-cols-2">
              {reservation.eventStartAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{formatDateTime(reservation.eventStartAt)}</span>
                </div>
              )}
              {reservation.eventLocation && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span className="truncate">{reservation.eventLocation}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="max-w-sm text-center text-[11px] font-semibold leading-relaxed text-slate-500">
          Mã vé QR sẽ tự động hiển thị trong mục <span className="font-extrabold text-brand-600">"Ví vé"</span> ngay khi Ban tổ chức CLB phê
          duyệt phiếu đăng ký của bạn.
        </p>

        <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row">
          <Link
            to="/student/registrations"
            className="btn-press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700"
          >
            <ListChecks className="h-4 w-4" aria-hidden="true" /> Xem lịch sử đăng ký
          </Link>
          <Link
            to="/student/home"
            className="btn-press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
