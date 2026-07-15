import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, MapPin, CheckSquare, Square, ArrowLeft, Send } from 'lucide-react';
import { requireCurrentUser } from '../../state/authSession';
import { formatDateTime } from '../../utils/formatDate';
import Breadcrumb from '../../components/common/Breadcrumb';
import Toast from '../../components/common/Toast';
import { eventService } from '../../services/eventService';
import { registrationService } from '../../services/registrationService';
import { Event } from '../../types/event';

export default function EventRegistrationConfirmPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const currentUser = requireCurrentUser();

  const [committed, setCommitted] = useState(false);
  const [note, setNote] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadEvent() {
      if (!eventId) return;
      setIsLoading(true);
      try {
        const data = await eventService.getByIdRemote(eventId);
        if (mounted) setEvent(data);
      } catch (error) {
        if (mounted) setToastMsg(error instanceof Error ? error.message : 'Không thể tải sự kiện.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvent();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  if (isLoading) {
    return <div className="py-12 text-center text-sm font-bold text-gray-500">Đang tải thông tin sự kiện...</div>;
  }

  if (!event) {
    return (
      <div className="py-12 text-center text-gray-400 font-bold space-y-4">
        <p>Sự kiện không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Link to="/student/events" className="text-brand-600 hover:underline">Quay lại danh sách</Link>
      </div>
    );
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!committed) return;

    if (!currentUser.mssv || !currentUser.className || !currentUser.email) {
      setToastMsg('Vui lòng hoàn tất MSSV, lớp và email trước khi gửi đăng ký.');
      return;
    }

    if (event.remainingTickets <= 0 || event.status === 'FULL') {
      setToastMsg('Sự kiện đã hết vé, không thể gửi đăng ký mới.');
      return;
    }

    if (event.status !== 'OPEN') {
      setToastMsg('Sự kiện hiện không mở đăng ký.');
      return;
    }

    try {
    const currentReservations = await registrationService.listByStudentRemote(currentUser.id);
    const duplicated = currentReservations.find(
      r => r.eventId === event.id && r.studentId === currentUser.id
    );

    if (duplicated) {
      setToastMsg('Bạn đã đăng ký sự kiện này rồi!');
      setTimeout(() => {
        navigate(`/student/events/${event.id}`);
      }, 1000);
      return;
    }

    const newResId = `res_${Date.now()}`;
    const newReservation = {
      id: newResId,
      eventId: event.id,
      studentId: currentUser.id,
      studentName: currentUser.fullName,
      mssv: currentUser.mssv || '',
      className: currentUser.className || '',
      email: currentUser.email,
      status: 'PENDING' as const,
      rejectReason: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const createdReservation = await registrationService.submit(newReservation);

    setToastMsg('Gửi yêu cầu đăng ký vé thành công!');
    setTimeout(() => {
      navigate(`/student/registrations/success/${createdReservation.id}`);
    }, 1200);
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : 'Không thể gửi đăng ký. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-6 text-left max-w-3xl mx-auto">
      <Breadcrumb items={[
        { label: 'Sinh viên', path: '/student' },
        { label: 'Sự kiện', path: '/student/events' },
        { label: event.title, path: `/student/events/${event.id}` },
        { label: 'Đăng ký vé' }
      ]} />

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-700 font-extrabold cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại chi tiết
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-950 tracking-tight">Xác Nhận Đăng Ký Vé Sự Kiện</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">Vui lòng rà soát kỹ các thông tin định danh sinh viên dưới đây trước khi gửi yêu cầu</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Event Summary Box */}
          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200/60 space-y-4">
            <span className="text-[10px] text-brand-600 font-extrabold uppercase tracking-widest block">Thông tin sự kiện đăng ký</span>
            <div className="space-y-3">
              <h4 className="text-sm font-extrabold text-gray-900 leading-snug">{event.title}</h4>
              <div className="space-y-2 text-xs font-semibold text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{formatDateTime(event.startAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Student Info review */}
          <div className="space-y-4 text-xs font-semibold text-gray-700">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Hồ sơ định danh của bạn</span>
            <div className="grid grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              <div className="space-y-1">
                <span className="text-[9px] text-gray-400 uppercase font-bold block">Họ và tên</span>
                <span className="text-gray-950 font-extrabold block">{currentUser.fullName}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-gray-400 uppercase font-bold block">Mã số sinh viên (MSSV)</span>
                <span className="text-gray-950 font-black font-mono block">{currentUser.mssv}</span>
              </div>
              <div className="space-y-1 pt-2">
                <span className="text-[9px] text-gray-400 uppercase font-bold block">Lớp học sinh hoạt</span>
                <span className="text-gray-950 font-extrabold font-mono block">{currentUser.className}</span>
              </div>
              <div className="space-y-1 pt-2">
                <span className="text-[9px] text-gray-400 uppercase font-bold block">Tài khoản email</span>
                <span className="text-gray-950 font-semibold block truncate" title={currentUser.email}>{currentUser.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Commitment check */}
        <form onSubmit={handleFormSubmit} className="space-y-6 pt-4 border-t border-gray-100">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Ghi chú cho Ban tổ chức</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Nhu cầu hỗ trợ chỗ ngồi, thông tin đi cùng đoàn, hoặc câu hỏi trước sự kiện..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm font-semibold text-gray-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <button
            type="button"
            onClick={() => setCommitted(!committed)}
            className="flex items-start gap-3 text-left w-full cursor-pointer focus:outline-none"
          >
            {committed ? (
              <CheckSquare className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Square className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-xs font-semibold text-gray-600 leading-relaxed select-none">
              <p className="font-extrabold text-gray-900">Cam kết tham gia đầy đủ, nghiêm túc</p>
              <p className="text-[10px] text-gray-500 mt-1">
                Tôi xác nhận thông tin trên là chính xác và cam kết sắp xếp thời gian tham dự đúng giờ. Nếu có thay đổi, tôi sẽ chủ động liên hệ hủy đăng ký trước 24 giờ.
              </p>
            </div>
          </button>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!committed}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer ${
                committed 
                  ? 'bg-brand-600 hover:bg-brand-700 text-white' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" /> Gửi yêu cầu đăng ký
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
