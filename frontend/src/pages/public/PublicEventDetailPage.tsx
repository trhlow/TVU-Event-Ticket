import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, LogIn, MapPin, Ticket, Users } from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import StatusBadge from "../../components/common/StatusBadge";
import EventBanner from "../../components/events/EventBanner";
import { eventService } from "../../services/eventService";
import { Event } from "../../types/event";
import { formatDateTime } from "../../utils/formatDate";

export default function PublicEventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadEvent() {
      if (!eventId) return;
      setIsLoading(true);
      setError("");
      try {
        const data = await eventService.getPublicEventById(eventId);
        if (mounted) setEvent(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Không thể tải chi tiết sự kiện.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvent();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  if (!eventId) return <Navigate to="/events" replace />;

  if (isLoading) {
    return (
      <div className="subtle-gradient-bg px-5 py-12 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <LoadingSkeleton type="list" count={4} />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="subtle-gradient-bg px-5 py-16 md:px-8">
        <EmptyState
          icon={Calendar}
          title="Không tìm thấy sự kiện"
          description="Sự kiện không tồn tại hoặc đã được gỡ khỏi danh sách công khai."
          actionText="Quay lại danh sách sự kiện"
          onAction={() => navigate("/events")}
        />
      </div>
    );
  }

  const isSoldOut = event.remainingTickets <= 0 || event.status === "FULL";

  return (
    <div className="subtle-gradient-bg px-5 py-12 md:px-8">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm font-extrabold text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách sự kiện
        </Link>

        <RevealOnScroll className="enterprise-card overflow-hidden">
          <div className="relative h-72">
            <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-72 w-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/18 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-brand-800">{event.category}</span>
                <StatusBadge type="event" status={event.status} />
              </div>
              <h1 className="font-display text-3xl font-extrabold leading-tight md:text-5xl">{event.title}</h1>
              <p className="mt-2 text-sm font-bold text-white/78">{event.clubName}</p>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
            <div>
              <h2 className="section-heading">Thông tin sự kiện</h2>
              <p className="mt-3 text-base font-medium leading-8 text-slate-600">{event.description}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <Calendar className="h-5 w-5 text-brand-700" />
                  <p className="mt-2 text-xs font-bold uppercase text-slate-400">Thời gian</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(event.startAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <MapPin className="h-5 w-5 text-brand-700" />
                  <p className="mt-2 text-xs font-bold uppercase text-slate-400">Địa điểm</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{event.location}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <Ticket className="h-5 w-5 text-brand-700" />
                  <p className="mt-2 text-xs font-bold uppercase text-slate-400">Vé còn lại</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{event.remainingTickets}/{event.capacity}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <Users className="h-5 w-5 text-brand-700" />
                  <p className="mt-2 text-xs font-bold uppercase text-slate-400">Điều kiện tham gia</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">Sinh viên, giảng viên TVU có tài khoản @tvu.edu.vn</p>
                </div>
              </div>
            </div>

            <aside className="rounded-3xl border border-brand-100 bg-brand-50/70 p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Đăng ký tham gia</p>
              <h3 className="mt-2 font-display text-2xl font-extrabold text-slate-950">
                {isSoldOut ? "Sự kiện đã hết vé" : "Đăng nhập để gửi đăng ký"}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Bạn cần đăng nhập bằng tài khoản TVU để gửi đăng ký và nhận vé QR sau khi được Ban tổ chức duyệt.
              </p>
              <Link to="/login" className="btn-press mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-5 text-sm font-extrabold text-white hover:bg-brand-800">
                <LogIn className="h-4 w-4" /> Đăng nhập để đăng ký
              </Link>
              <Link to="/events" className="btn-press mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-brand-200 bg-white px-5 text-sm font-extrabold text-brand-800 hover:bg-brand-50">
                Quay lại danh sách sự kiện
              </Link>
            </aside>
          </div>
        </RevealOnScroll>
      </div>
    </div>
  );
}
