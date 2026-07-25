import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Info, MapPin, ShieldAlert, Ticket } from "lucide-react";
import { requireCurrentUser } from "../../state/authSession";
import PageHeader from "../../components/common/PageHeader";
import EventBanner from "../../components/events/EventBanner";
import StatusBadge from "../../components/common/StatusBadge";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import { useToast } from "../../components/common/ToastProvider";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";

export default function StudentEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [event, setEvent] = useState<Event | undefined>();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!eventId) return;
      setIsLoading(true);
      try {
        const [eventData, reservationData] = await Promise.all([
          eventService.getPublicEventById(eventId),
          registrationService.listByStudentRemote(currentUser.id).catch(() => [] as Reservation[]),
        ]);
        if (!mounted) return;
        setEvent(eventData);
        setReservations(reservationData);
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải chi tiết sự kiện.", "error");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadDetail();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, eventId]);

  const existingReservation = useMemo(
    () => reservations.find((item) => item.eventId === event?.id),
    [event?.id, reservations],
  );

  const handleRegisterClick = () => {
    if (!event) return;
    if (!currentUser.profileComplete) {
      navigate("/student/profile/complete");
      return;
    }
    navigate(`/student/events/${event.id}/register`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <LoadingSkeleton type="list" count={4} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4 py-12 text-center font-bold text-slate-400">
        <p>Sự kiện không tồn tại, đã đóng, hoặc không còn công khai.</p>
        <Link to="/student/events" className="text-brand-600 hover:underline">Quay lại danh sách</Link>
      </div>
    );
  }

  const isSoldOut = event.remainingTickets <= 0 || event.status === "FULL";

  return (
    <div className="space-y-6 text-left">
      <PageHeader title="Chi tiết sự kiện" />

      <button
        onClick={() => navigate(-1)}
        className="flex cursor-pointer items-center gap-1.5 text-xs font-extrabold text-slate-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quay lại trang trước
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="enterprise-card overflow-hidden">
            <div className="relative h-64 overflow-hidden bg-slate-100 sm:h-80">
              <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-64 w-full sm:h-80" />
              <div className="absolute left-4 top-4 flex gap-2">
                <span className="rounded-xl bg-slate-950/80 px-3 py-1 text-xs font-black text-white backdrop-blur-xs">
                  {event.category}
                </span>
                <StatusBadge type="event" status={event.status} />
              </div>
            </div>

            <div className="space-y-4 p-6 md:p-8">
              <div className="space-y-1">
                <span className="block text-xs font-extrabold uppercase tracking-wider text-brand-600">{event.clubName}</span>
                <h1 className="text-xl font-black leading-tight tracking-tight text-slate-950 md:text-2xl">{event.title}</h1>
              </div>

              <div className="grid grid-cols-1 gap-4 border-y border-slate-100 py-4 text-xs font-semibold text-slate-700 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="space-y-0.5 text-left">
                    <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Thời gian tổ chức</span>
                    <span className="mt-1 block font-bold text-slate-900">{formatDateTime(event.startAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="space-y-0.5 text-left">
                    <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Địa điểm tổ chức</span>
                    <span className="mt-1 block max-w-[220px] truncate font-bold text-slate-900" title={event.location}>{event.location}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-950">Mô tả sự kiện</h3>
                <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">{event.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="enterprise-card space-y-6 p-6">
            <div className="border-b border-slate-100 pb-4">
              <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Tình trạng vé</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl font-black ${isSoldOut ? "text-danger-600" : "text-success-600"}`}>
                  {isSoldOut ? "HẾT VÉ" : event.remainingTickets}
                </span>
                {!isSoldOut && <span className="text-xs font-bold text-slate-500">vé khả dụng / {event.capacity} chỗ</span>}
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-semibold text-slate-600">
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Mở đăng ký</span>
                  <span className="mt-1 block font-bold text-slate-900">{formatDateTime(event.registrationOpenAt)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Đóng đăng ký</span>
                  <span className="mt-1 block font-bold text-slate-900">{formatDateTime(event.registrationCloseAt)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              {existingReservation ? (
                <div className="space-y-3 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <StatusBadge type="reservation" status={existingReservation.status} />
                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                      {existingReservation.status === "PENDING"
                        ? "Bạn đã gửi đăng ký. Vui lòng chờ Ban tổ chức CLB kiểm duyệt."
                        : existingReservation.status === "APPROVED"
                          ? "Đăng ký đã được duyệt. Vé QR sẽ được backend/notification cấp qua email nếu sẵn sàng."
                          : "Yêu cầu của bạn đã bị từ chối."}
                    </p>
                  </div>
                  {existingReservation.status === "APPROVED" && (
                    <Link
                      to="/student/tickets"
                      className="btn-press flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700"
                    >
                      <Ticket className="h-4 w-4" aria-hidden="true" /> Đi tới ví vé QR
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {event.status === "OPEN" && !isSoldOut ? (
                    <button
                      onClick={handleRegisterClick}
                      className="btn-press flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-xs font-black text-white shadow-sm hover:bg-brand-700"
                    >
                      <Ticket className="h-4 w-4" aria-hidden="true" /> Đăng ký vé tham dự
                    </button>
                  ) : (
                    <button disabled className="w-full cursor-not-allowed rounded-xl bg-slate-100 py-3 text-xs font-black text-slate-400">
                      {isSoldOut ? "Hết vé tham dự" : "Sự kiện hiện không mở đăng ký"}
                    </button>
                  )}

                  {!currentUser.profileComplete && (
                    <div className="flex gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-[10px] font-semibold text-amber-800">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
                      <span>Bạn chưa hoàn tất MSSV và lớp. Hệ thống yêu cầu cập nhật hồ sơ trước khi đăng ký vé.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-info-100 bg-info-50/50 p-4 text-[11px] font-semibold text-brand-900">
            <p className="flex items-center gap-1 font-extrabold">
              <Info className="h-4 w-4 text-brand-600" aria-hidden="true" /> Lưu ý quan trọng khi nhận vé:
            </p>
            <p className="leading-relaxed">- Mỗi sinh viên chỉ gửi một đăng ký cho mỗi sự kiện.</p>
            <p className="leading-relaxed">- Vé QR hợp lệ được cấp sau khi Ban tổ chức duyệt đăng ký.</p>
            <p className="leading-relaxed">- Frontend không tự tạo QR ký; check-in chỉ nhận payload do backend/notification cấp.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
