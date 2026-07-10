import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CalendarDays, Filter, Search, Sparkles } from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import EventCard from "../../components/events/EventCard";
import { mockClubs } from "../../data/mockClubs";
import { eventService } from "../../services/eventService";
import { Event } from "../../types/event";

const statusOptions = [
  { label: "Tất cả trạng thái", value: "ALL" },
  { label: "Đang mở đăng ký", value: "OPEN" },
  { label: "Sắp diễn ra", value: "UPCOMING" },
  { label: "Đã đóng đăng ký", value: "CLOSED" },
  { label: "Đã kết thúc", value: "ENDED" },
];

export default function PublicEventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [clubId, setClubId] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  useEffect(() => {
    let mounted = true;

    async function loadEvents() {
      setIsLoading(true);
      setError("");
      try {
        const data = await eventService.getPublicEvents();
        if (mounted) setEvents(data);
      } catch {
        if (mounted) setError("Không thể tải danh sách sự kiện. Vui lòng thử lại.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvents();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return events.filter((event) => {
      const matchesSearch =
        !normalized ||
        event.title.toLowerCase().includes(normalized) ||
        event.clubName.toLowerCase().includes(normalized) ||
        event.location.toLowerCase().includes(normalized);
      const matchesClub = clubId === "ALL" || event.clubId === clubId;
      const matchesStatus = status === "ALL" || event.status === status;
      return matchesSearch && matchesClub && matchesStatus;
    });
  }, [events, searchTerm, clubId, status]);

  const featuredEvents = useMemo(
    () => events.filter((event) => event.status === "OPEN" || event.status === "UPCOMING").slice(0, 6),
    [events],
  );

  return (
    <div className="subtle-gradient-bg text-left">
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-[1180px]">
          <div className="page-hero p-6 text-white md:p-8">
            <p className="animate-slide-right inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-4 w-4" /> Sự kiện công khai
            </p>
            <h1 className="animate-slide-up mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
              Khám phá sự kiện tại Đại học Trà Vinh
            </h1>
            <p className="animate-slide-up mt-3 max-w-3xl text-base font-medium leading-7 text-white/82" style={{ animationDelay: "120ms" }}>
              Theo dõi các hoạt động, chương trình, hội thảo và sự kiện do các Câu lạc bộ tổ chức.
            </p>
            <div className="animate-slide-up mt-6 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "220ms" }}>
              <a href="#event-list" className="btn-press inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-extrabold text-brand-800">
                Xem sự kiện đang mở
              </a>
              <Link to="/login" className="btn-press inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/30 px-5 text-sm font-extrabold text-white hover:bg-white/10">
                Đăng nhập để đăng ký
              </Link>
            </div>
          </div>
        </div>
      </section>

      <RevealOnScroll as="section" className="px-5 pb-8 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="enterprise-card p-4 md:p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
              <label className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="tvu-input pl-10"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm tên sự kiện, CLB hoặc địa điểm"
                />
              </label>
              <label className="relative">
                <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select className="tvu-input pl-10" value={clubId} onChange={(event) => setClubId(event.target.value)}>
                  <option value="ALL">Tất cả CLB</option>
                  {mockClubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
              </label>
              <select className="tvu-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </RevealOnScroll>

      <section id="event-list" className="px-5 py-8 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Danh sách sự kiện</p>
              <h2 className="section-heading mt-1">Sự kiện phù hợp</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500">
              {filteredEvents.length} kết quả
            </span>
          </div>

          {isLoading ? (
            <LoadingSkeleton type="card" count={6} />
          ) : error ? (
            <div className="enterprise-card p-6 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
              <p className="mt-3 text-sm font-bold text-slate-700">{error}</p>
              <button onClick={() => window.location.reload()} className="btn-press mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white">
                Thử lại
              </button>
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredEvents.map((event, index) => (
                <RevealOnScroll key={event.id} delay={index * 70}>
                  <EventCard
                    event={event}
                    onViewDetails={(id) => navigate(`/events/${id}`)}
                    onRegister={() => navigate("/login")}
                    actionText="Xem chi tiết"
                  />
                </RevealOnScroll>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Chưa có sự kiện phù hợp."
              description="Bạn có thể thay đổi bộ lọc hoặc quay lại danh sách tất cả sự kiện."
              actionText="Xem tất cả sự kiện"
              onAction={() => {
                setSearchTerm("");
                setClubId("ALL");
                setStatus("ALL");
              }}
            />
          )}
        </div>
      </section>

      {featuredEvents.length > 0 && (
        <RevealOnScroll as="section" className="px-5 pb-16 pt-8 md:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Nổi bật</p>
              <h2 className="section-heading mt-1">Sự kiện đáng chú ý</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {featuredEvents.slice(0, 3).map((event, index) => (
                <RevealOnScroll key={event.id} delay={index * 100}>
                  <EventCard event={event} onViewDetails={(id) => navigate(`/events/${id}`)} onRegister={() => navigate("/login")} />
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </RevealOnScroll>
      )}
    </div>
  );
}
