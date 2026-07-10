import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, MapPin, Ticket, ArrowLeft, Clock, Info, ShieldAlert } from 'lucide-react';
import { mockEvents } from '../../data/mockEvents';
import { mockReservations } from '../../data/mockReservations';
import { getCurrentUser } from '../../data/mockAuth';
import StatusBadge from '../../components/common/StatusBadge';
import { formatDateTime } from '../../utils/formatDate';
import Breadcrumb from '../../components/common/Breadcrumb';
import EventBanner from '../../components/events/EventBanner';

export default function StudentEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const event = mockEvents.find(e => e.id === eventId);

  if (!event) {
    return (
      <div className="py-12 text-center text-gray-400 font-bold space-y-4">
        <p>Sự kiện không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Link to="/student/events" className="text-brand-600 hover:underline">Quay lại danh sách</Link>
      </div>
    );
  }

  // Check if student already registered
  const existingReservation = mockReservations.find(
    r => r.eventId === event.id && r.studentId === currentUser.id
  );

  const handleRegisterClick = () => {
    if (!currentUser.profileComplete) {
      navigate('/student/profile/complete');
      return;
    }
    navigate(`/student/events/${event.id}/register`);
  };

  const isSoldOut = event.remainingTickets === 0 || event.status === 'FULL';

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[
        { label: 'Sinh viên', path: '/student' },
        { label: 'Sự kiện', path: '/student/events' },
        { label: 'Chi tiết' }
      ]} />

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-700 font-extrabold cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại trang trước
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Main details and description */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Banner */}
            <div className="h-64 sm:h-80 bg-gray-100 overflow-hidden relative">
              <EventBanner
                src={event.bannerUrl}
                alt={event.title}
                category={event.category}
                className="h-64 sm:h-80 w-full"
              />
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-[#111218]/80 text-white px-3 py-1 rounded-xl text-xs font-black backdrop-blur-xs">
                  {event.category}
                </span>
                <StatusBadge type="event" status={event.status} />
              </div>
            </div>

            {/* Title & Host info */}
            <div className="p-6 md:p-8 space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-brand-600 font-extrabold uppercase tracking-wider block">{event.clubName}</span>
                <h1 className="text-xl md:text-2xl font-black text-gray-950 tracking-tight leading-tight">
                  {event.title}
                </h1>
              </div>

              {/* Technical key facts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-gray-100 text-xs text-gray-700 font-semibold">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="space-y-0.5 text-left">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase leading-none">Thời gian tổ chức</span>
                    <span className="mt-1 block font-bold text-gray-900">{formatDateTime(event.startAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="space-y-0.5 text-left">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase leading-none">Địa điểm tổ chức</span>
                    <span className="mt-1 block font-bold text-gray-900 truncate max-w-[220px]" title={event.location}>{event.location}</span>
                  </div>
                </div>
              </div>

              {/* Description Body */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wider">Mô tả sự kiện</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-semibold whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Registration status & card action block */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
            <div className="pb-4 border-b border-gray-100">
              <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">Tình trạng vé</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className={`text-2xl font-black ${isSoldOut ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {isSoldOut ? 'HẾT VÉ' : `${event.remainingTickets}`}
                </span>
                {!isSoldOut && <span className="text-xs font-bold text-gray-500">vé khả dụng / {event.capacity} chỗ</span>}
              </div>
            </div>

            {/* Time windows */}
            <div className="space-y-3.5 text-xs font-semibold text-gray-600">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                <div className="text-left">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase leading-none">Mở đăng ký vé</span>
                  <span className="text-gray-900 font-bold mt-1 block">{formatDateTime(event.registrationOpenAt)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                <div className="text-left">
                  <span className="text-[10px] text-gray-400 font-bold block uppercase leading-none">Đóng đăng ký vé</span>
                  <span className="text-gray-900 font-bold mt-1 block">{formatDateTime(event.registrationCloseAt)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2">
              {existingReservation ? (
                <div className="space-y-3 text-center">
                  <div className="p-4 rounded-xl border bg-gray-50 flex flex-col items-center justify-center gap-2">
                    <StatusBadge type="reservation" status={existingReservation.status} />
                    <p className="text-[11px] text-gray-500 font-bold mt-1">
                      {existingReservation.status === 'PENDING' 
                        ? 'Bạn đã gửi đăng ký. Vui lòng chờ Ban tổ chức CLB kiểm duyệt hồ sơ.'
                        : existingReservation.status === 'APPROVED'
                        ? 'Đăng ký của bạn đã được duyệt thành công! Vui lòng truy cập Ví Vé để xem mã QR.'
                        : 'Yêu cầu của bạn đã bị từ chối.'}
                    </p>
                    {existingReservation.rejectReason && (
                      <p className="text-[10px] text-rose-600 font-black italic mt-1 bg-rose-50 px-2 py-1 rounded">
                        Lý do: {existingReservation.rejectReason}
                      </p>
                    )}
                  </div>
                  {existingReservation.status === 'APPROVED' && (
                    <Link
                      to="/student/tickets"
                      className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ticket className="w-4 h-4" /> Đi tới Ví Vé QR
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {event.status === 'OPEN' && !isSoldOut ? (
                    <button
                      onClick={handleRegisterClick}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black shadow-lg shadow-brand-600/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ticket className="w-4 h-4 animate-pulse" /> Đăng ký vé tham dự
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-3 bg-gray-100 text-gray-400 rounded-xl text-xs font-black cursor-not-allowed"
                    >
                      {event.status === 'UPCOMING' 
                        ? 'Sự kiện chưa mở đăng ký' 
                        : isSoldOut 
                        ? 'Hết vé tham dự' 
                        : 'Thời gian đăng ký đã kết thúc'}
                    </button>
                  )}

                  {!currentUser.profileComplete && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-800 font-semibold flex gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Bạn chưa hoàn tất MSSV & Lớp. Hệ thống yêu cầu cập nhật hồ sơ trước khi đăng ký vé.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Guidelines box */}
          <div className="bg-brand-50/40 border border-brand-100 p-4 rounded-2xl text-[11px] text-brand-900 font-semibold space-y-2">
            <p className="font-extrabold flex items-center gap-1">
              <Info className="w-4 h-4 text-brand-600" /> Lưu ý quan trọng khi nhận vé:
            </p>
            <p className="leading-relaxed pl-1">• Mỗi sinh viên chỉ được đăng ký tối đa 01 vé cho mỗi chương trình.</p>
            <p className="leading-relaxed pl-1">• Vui lòng mang theo mã QR khi đến hội trường tham dự.</p>
            <p className="leading-relaxed pl-1">• Các trường hợp đăng ký ảo không đi tham gia quá 3 lần liên tiếp sẽ bị khóa tài khoản.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
