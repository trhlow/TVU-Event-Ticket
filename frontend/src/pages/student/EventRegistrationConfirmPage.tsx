import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, MapPin, CheckSquare, Square, ArrowLeft, Send } from 'lucide-react';
import { requireCurrentUser } from '../../state/authSession';
import { formatDateTime } from '../../utils/formatDate';
import PageHeader from '../../components/common/PageHeader';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { useToast } from '../../components/common/ToastProvider';
import { eventService } from '../../services/eventService';
import { registrationService } from '../../services/registrationService';
import { Event } from '../../types/event';

export default function EventRegistrationConfirmPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();

  const [committed, setCommitted] = useState(false);
  const [note, setNote] = useState('');
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadEvent() {
      if (!eventId) return;
      setIsLoading(true);
      try {
        const data = await eventService.getByIdRemote(eventId);
        if (mounted) setEvent(data);
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : 'Không thể tải sự kiện.', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvent();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 text-left">
        <LoadingSkeleton type="list" count={4} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="py-12 text-center text-slate-400 font-bold space-y-4">
        <p>Sự kiện không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Link to="/student/events" className="text-brand-600 hover:underline">Quay lại danh sách</Link>
      </div>
    );
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!committed || isSubmitting) return;

    if (!currentUser.mssv || !currentUser.className || !currentUser.email) {
      showToast('Vui lòng hoàn tất MSSV, lớp và email trước khi gửi đăng ký.', 'error');
      return;
    }

    if (event.remainingTickets <= 0 || event.status === 'FULL') {
      showToast('Sự kiện đã hết vé, không thể gửi đăng ký mới.', 'error');
      return;
    }

    if (event.status !== 'OPEN') {
      showToast('Sự kiện hiện không mở đăng ký.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentReservations = await registrationService.listByStudentRemote(currentUser.id);
      const duplicated = currentReservations.find(
        r => r.eventId === event.id && r.studentId === currentUser.id
      );

      if (duplicated) {
        showToast('Bạn đã đăng ký sự kiện này rồi!', 'error');
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
        // `note` is the student's own message to the organizer — it must not be stored under
        // `rejectReason`, which is reserved for the organizer's reason when rejecting a request.
        note: note.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const createdReservation = await registrationService.submit(newReservation);

      showToast('Gửi yêu cầu đăng ký vé thành công!');
      setTimeout(() => {
        navigate(`/student/registrations/success/${createdReservation.id}`);
      }, 1200);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể gửi đăng ký. Vui lòng thử lại.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-left max-w-3xl mx-auto">
      <PageHeader
        breadcrumb={[
          { label: 'Sinh viên', path: '/student' },
          { label: 'Sự kiện', path: '/student/events' },
          { label: event.title, path: `/student/events/${event.id}` },
          { label: 'Đăng ký vé' },
        ]}
        title="Xác nhận đăng ký vé sự kiện"
        description="Vui lòng rà soát kỹ các thông tin định danh sinh viên dưới đây trước khi gửi yêu cầu."
      />

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-700 font-extrabold cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại chi tiết
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Event Summary Box */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/60 space-y-4">
            <span className="text-[10px] text-brand-600 font-extrabold uppercase tracking-widest block">Thông tin sự kiện đăng ký</span>
            <div className="space-y-3">
              <h4 className="text-sm font-extrabold text-slate-900 leading-snug">{event.title}</h4>
              <div className="space-y-2 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{formatDateTime(event.startAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Student Info review */}
          <div className="space-y-4 text-xs font-semibold text-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hồ sơ định danh của bạn</span>
            <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Họ và tên</span>
                <span className="text-slate-950 font-extrabold block">{currentUser.fullName}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Mã số sinh viên (MSSV)</span>
                <span className="text-slate-950 font-black font-mono block">{currentUser.mssv}</span>
              </div>
              <div className="space-y-1 pt-2">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Lớp học sinh hoạt</span>
                <span className="text-slate-950 font-extrabold font-mono block">{currentUser.className}</span>
              </div>
              <div className="space-y-1 pt-2">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Tài khoản email</span>
                <span className="text-slate-950 font-semibold block truncate" title={currentUser.email}>{currentUser.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Commitment check */}
        <form onSubmit={handleFormSubmit} className="space-y-6 pt-4 border-t border-slate-100">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ghi chú cho Ban tổ chức</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Nhu cầu hỗ trợ chỗ ngồi, thông tin đi cùng đoàn, hoặc câu hỏi trước sự kiện..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-900 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
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
              <Square className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-xs font-semibold text-slate-600 leading-relaxed select-none">
              <p className="font-extrabold text-slate-900">Cam kết tham gia đầy đủ, nghiêm túc</p>
              <p className="text-[10px] text-slate-500 mt-1">
                Tôi xác nhận thông tin trên là chính xác và cam kết sắp xếp thời gian tham dự đúng giờ. Nếu có thay đổi, tôi sẽ chủ động liên hệ hủy đăng ký trước 24 giờ.
              </p>
            </div>
          </button>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!committed || isSubmitting}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed ${
                committed && !isSubmitting
                  ? 'bg-brand-600 hover:bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Send className="w-4 h-4" /> {isSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu đăng ký'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
