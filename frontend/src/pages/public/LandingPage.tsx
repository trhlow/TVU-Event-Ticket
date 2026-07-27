import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ScanLine,
  ShieldCheck,
  Share2,
  Sparkles,
  Ticket,
  Users,
  UserCheck,
  Zap,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import EmptyState from "../../components/common/EmptyState";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import ScrollToTopButton from "../../components/common/ScrollToTopButton";
import { eventService } from "../../services/eventService";
import { Event } from "../../types/event";
import { formatDateTime } from "../../utils/formatDate";

const features = [
  {
    icon: Zap,
    title: "Đăng ký nhanh chóng",
    description: "Giao diện tối giản giúp sinh viên tìm kiếm và đặt vé sự kiện chỉ trong vài cú nhấp chuột.",
    tone: "text-blue-700 bg-blue-50",
  },
  {
    icon: QrCode,
    title: "Vé QR Code",
    description: "Mỗi vé phát hành đi kèm một mã QR duy nhất, đảm bảo tính bảo mật và dễ dàng truy xuất từ điện thoại.",
    tone: "text-indigo-700 bg-indigo-50",
  },
  {
    icon: ScanLine,
    title: "Check-in tiện lợi",
    description: "Ban tổ chức dễ dàng quét mã QR tại cổng sự kiện để xác nhận tham gia nhanh chóng và chính xác.",
    tone: "text-sky-700 bg-sky-50",
  },
  {
    icon: ShieldCheck,
    title: "Chống vé ảo",
    description: "Hệ thống đồng bộ dữ liệu sinh viên trực tiếp, ngăn chặn tình trạng đầu cơ hoặc đăng ký ảo.",
    tone: "text-rose-700 bg-rose-50",
  },
];

const guideSteps = [
  {
    icon: GraduationCap,
    title: "Dành cho sinh viên",
    description: "Tìm sự kiện phù hợp, đăng nhập bằng tài khoản TVU và gửi đăng ký tham dự trong vài bước rõ ràng.",
    steps: ["Xem danh sách sự kiện", "Đăng nhập tài khoản TVU", "Gửi đăng ký", "Theo dõi trạng thái duyệt"],
  },
  {
    icon: ClipboardCheck,
    title: "Dành cho Ban tổ chức",
    description: "Quản lý sự kiện, kiểm tra danh sách đăng ký, duyệt người tham dự và theo dõi số lượng vé còn lại.",
    steps: ["Tạo hoặc cập nhật sự kiện", "Kiểm tra đăng ký", "Duyệt người tham dự", "Theo dõi vé và check-in"],
  },
  {
    icon: UserCheck,
    title: "Check-in bằng QR",
    description: "Mỗi vé điện tử có mã QR riêng, giúp xác nhận tham dự nhanh chóng và hạn chế vé không hợp lệ.",
    steps: ["Mở vé điện tử", "Quét mã QR tại cổng", "Xác nhận hợp lệ", "Ghi nhận tham dự"],
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

function eventStatusLabel(status: Event["status"]) {
  switch (status) {
    case "OPEN":
      return "Đang mở đăng ký";
    case "UPCOMING":
      return "Sắp diễn ra";
    case "CLOSED":
      return "Đã đóng đăng ký";
    case "FULL":
      return "Hết vé";
    case "ENDED":
      return "Đã kết thúc";
    default:
      return "Bản nháp";
  }
}

function eventStatusClass(status: Event["status"]) {
  if (status === "OPEN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "UPCOMING") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "FULL") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ENDED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-600";
}

function sortFeatured(events: Event[]) {
  const rank: Record<Event["status"], number> = { OPEN: 0, UPCOMING: 1, FULL: 2, CLOSED: 3, ENDED: 4, DRAFT: 5 };
  return [...events]
    .filter((event) => event.status !== "DRAFT")
    .sort((a, b) => rank[a.status] - rank[b.status] || new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 8);
}

export default function LandingPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const reducedMotion = useReducedMotion();
  const visibleEvents = useMemo(() => sortFeatured(events), [events]);

  useEffect(() => {
    document.title = "TVU Ticket | Hệ thống quản lý vé sự kiện";
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadEvents() {
      setIsLoading(true);
      setError("");
      try {
        const data = await eventService.getFeaturedEvents(8);
        if (mounted) setEvents(data);
      } catch {
        if (mounted) setError("Không thể tải danh sách sự kiện nổi bật. Vui lòng thử lại sau.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvents();
    return () => {
      mounted = false;
    };
  }, []);

  useGSAP(
    () => {
      if (reducedMotion) return;

      gsap.from(".landing-hero-copy .landing-fade-up", {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 0.15,
        ease: "power2.out",
      });
    },
    { scope: rootRef, dependencies: [reducedMotion] },
  );

  return (
    <div ref={rootRef} className="landing-page relative w-full max-w-full overflow-x-hidden bg-slate-50 text-left text-slate-900">
      <section
        id="home"
        ref={heroRef}
        className="landing-hero relative isolate min-h-[calc(100vh-4rem)] scroll-mt-16 overflow-hidden bg-slate-950"
      >
        <img
          src="/DJI_0431.jpg"
          alt="Khuôn viên Trường Đại học Trà Vinh nhìn từ trên cao"
          className="landing-hero-bg absolute inset-0 h-[112%] w-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/72 via-blue-950/62 to-slate-950/88" aria-hidden="true" />
        <div className="landing-hero-pattern absolute inset-0" aria-hidden="true" />

        <div className="landing-hero-copy relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1180px] items-center justify-center px-5 pb-28 pt-20 text-center md:px-8 md:pb-36">
          <div className="flex max-w-4xl flex-col items-center">
            <p className="landing-fade-up inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-100 shadow-sm backdrop-blur-md">
              <Sparkles className="h-4 w-4" /> Nền tảng vé sự kiện chính thức
            </p>
            <h1 className="landing-fade-up mt-7 max-w-4xl font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.025em] text-white drop-shadow-lg sm:text-5xl lg:text-7xl">
              Quản lý vé sự kiện đơn giản, minh bạch và an toàn
            </h1>
            <p className="landing-fade-up mt-6 max-w-2xl text-base font-medium leading-7 text-blue-50/90 drop-shadow md:text-lg">
              Đăng ký, duyệt và check-in sự kiện bằng vé QR điện tử — dành cho sinh viên và các câu lạc bộ trực thuộc Trường Đại học Trà Vinh.
            </p>
            <div className="landing-fade-up mt-9 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="btn-press group inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-extrabold text-blue-900 shadow-xl shadow-slate-950/25 hover:bg-blue-50"
              >
                Đăng nhập ngay <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link
                to="/#guide"
                className="btn-press inline-flex h-13 flex-1 items-center justify-center rounded-full border border-white/30 bg-white/10 px-7 text-sm font-bold text-white shadow-sm backdrop-blur-md hover:bg-white/20"
              >
                Xem hướng dẫn
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="landing-main-shell relative z-20 -mt-12 overflow-hidden rounded-t-[2rem] bg-white md:-mt-16 md:rounded-t-[3rem]">
        <RevealOnScroll as="section" id="features" className="scroll-mt-20 px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto max-w-[1180px]">
            <div className="landing-section-heading mx-auto max-w-2xl text-center">
              <h2 id="features-title" className="font-display text-3xl font-extrabold tracking-tight text-blue-950 md:text-4xl">Tại sao chọn TVU Ticket?</h2>
              <p className="mt-4 text-sm font-medium leading-7 text-slate-600 md:text-base">
                Một nền tảng thống nhất cho toàn bộ hành trình sự kiện — từ đăng ký, xét duyệt đến check-in tại cổng.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <RevealOnScroll key={feature.title} delay={index * 80}>
                  <FeatureCard feature={feature} />
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </RevealOnScroll>

        <section id="events" className="landing-soft-section relative scroll-mt-20 px-0 py-20 md:py-24">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-5 text-center md:px-8">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-blue-950 md:text-4xl">Sự kiện nổi bật</h2>
            <Link
              to="/login"
              className="group inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
            >
              Khám phá sự kiện <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-12">
            {isLoading ? (
              <div className="mx-auto max-w-[1180px] px-5 md:px-8">
                <LoadingSkeleton type="card" count={3} />
              </div>
            ) : error ? (
              <div className="mx-auto max-w-[1180px] px-5 md:px-8">
                <EmptyState title="Chưa tải được sự kiện" description={error} icon={CalendarDays} />
              </div>
            ) : visibleEvents.length > 0 ? (
              <EventGrid events={visibleEvents} onOpen={() => navigate("/login")} />
            ) : (
              <div className="mx-auto max-w-[1180px] px-5 md:px-8">
                <EmptyState
                  title="Chưa có sự kiện nổi bật"
                  description="Hiện chưa có sự kiện đang mở đăng ký hoặc sắp diễn ra. Vui lòng quay lại sau."
                  icon={CalendarDays}
                />
              </div>
            )}
          </div>
        </section>

        <RevealOnScroll as="section" id="guide" className="landing-guide-section relative isolate scroll-mt-20 overflow-hidden px-5 py-20 md:px-8 md:py-24">
          <div className="landing-guide-glow landing-guide-glow-left" aria-hidden="true" />
          <div className="landing-guide-glow landing-guide-glow-right" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">Bắt đầu thật đơn giản</h2>
              <p className="mt-4 text-sm font-medium leading-7 text-blue-100/80 md:text-base">
                Quy trình rõ ràng cho sinh viên, Ban tổ chức và đội ngũ check-in.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {guideSteps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <RevealOnScroll key={item.title} delay={index * 90}>
                    <article className="landing-guide-card h-full rounded-2xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-slate-950/15 backdrop-blur">
                      <div className="flex items-start gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-800">
                          <Icon className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="font-display text-lg font-extrabold text-slate-900">{item.title}</h3>
                          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.description}</p>
                        </div>
                      </div>

                      <ol className="mt-6 space-y-3">
                        {item.steps.map((step, stepIndex) => (
                          <li key={step} className="landing-guide-step flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-extrabold text-blue-800 shadow-sm ring-1 ring-blue-100">
                              {stepIndex + 1}
                            </span>
                            <span className="text-sm font-semibold text-slate-700">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  </RevealOnScroll>
                );
              })}
            </div>
          </div>
        </RevealOnScroll>

        <section className="bg-white px-5 py-20 md:px-8 md:py-24">
          <div className="landing-cta mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-8 rounded-[2rem] px-7 py-10 text-center text-white md:flex-row md:px-12 md:py-12 md:text-left">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Sẵn sàng cho sự kiện tiếp theo?</h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-blue-100/85 md:text-base">
                Đăng nhập bằng tài khoản Microsoft của trường để đăng ký sự kiện và nhận vé QR ngay khi được duyệt.
              </p>
            </div>
            <Link
              to="/login"
              className="btn-press group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-extrabold text-blue-900 shadow-lg shadow-slate-950/20 hover:bg-blue-50"
            >
              Đăng nhập ngay <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        <LandingFooter />
      </div>
      <ScrollToTopButton showAfterElementId="features-title" />
    </div>
  );
}

type FeatureItem = (typeof features)[number];

function FeatureCard({ feature }: { feature: FeatureItem }) {
  const Icon = feature.icon;

  return (
    <article className="landing-feature-card group h-full rounded-2xl border border-slate-200/80 bg-white p-6">
      <div className={`grid h-12 w-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 ${feature.tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-5 font-display text-lg font-extrabold text-slate-900">{feature.title}</h3>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{feature.description}</p>
    </article>
  );
}

function EventGrid({ events, onOpen }: { events: Event[]; onOpen: (eventId: string) => void }) {
  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 px-5 sm:grid-cols-2 lg:grid-cols-3 md:px-8">
      {events.map((event) => (
        <LandingEventCard key={event.id} event={event} onOpen={onOpen} />
      ))}
    </div>
  );
}

interface LandingEventCardProps {
  event: Event;
  onOpen: (eventId: string) => void;
}

function LandingEventCard({ event, onOpen }: LandingEventCardProps) {
  const isAvailable = event.status === "OPEN" && event.remainingTickets > 0;

  return (
    <article className="landing-event-card group overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="relative aspect-[16/10] overflow-hidden bg-blue-950">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-sky-500 text-white">
            <Ticket className="h-12 w-12" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/58 via-slate-950/4 to-transparent" aria-hidden="true" />
        <span className={`absolute right-3 top-3 rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur ${eventStatusClass(event.status)}`}>
          {eventStatusLabel(event.status)}
        </span>
      </div>

      <div className="flex min-h-[242px] flex-col p-6">
        {event.clubName && <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-blue-700">{event.clubName}</p>}
        <h3 className="mt-2 line-clamp-2 font-display text-lg font-extrabold leading-snug text-slate-900">{event.title}</h3>
        <div className="mt-4 space-y-2 text-sm font-medium text-slate-600">
          <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-700" /> {formatDateTime(event.startAt)}</p>
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-700" /> <span className="line-clamp-1">{event.location}</span></p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-700" />
            {event.remainingTickets > 0 ? `Còn ${event.remainingTickets}/${event.capacity} vé` : "Không còn vé khả dụng"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpen(event.id)}
          className={[
            "btn-press group/btn mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold",
            isAvailable
              ? "bg-blue-800 text-white hover:bg-blue-700"
              : "border border-blue-200 bg-white text-blue-800 hover:bg-blue-50",
          ].join(" ")}
        >
          Đăng nhập để đăng ký
          <ArrowRight className="h-4 w-4 transition group-hover/btn:translate-x-1" />
        </button>
      </div>
    </article>
  );
}

function LandingFooter() {
  return (
    <footer className="bg-slate-950 px-5 py-14 text-slate-300 md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <img src="/tvu_logo_1783065060265.jpg" alt="Logo TVU" className="h-10 w-10 rounded-full bg-white object-contain ring-2 ring-white/15" />
            <p className="font-display text-xl font-extrabold text-white">TVU Ticket</p>
          </div>
          <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-slate-400">
            Hệ thống quản lý và phân phối vé sự kiện chính thức dành cho sinh viên và các Câu lạc bộ trực thuộc Trường Đại học Trà Vinh.
          </p>
          <div className="mt-5 flex gap-3 text-blue-300" aria-hidden="true">
            <Share2 className="h-4 w-4" />
            <Users className="h-4 w-4" />
          </div>
        </div>
        <FooterColumn
          title="Khám phá"
          links={[
            ["Trang chủ", "/"],
            ["Đăng nhập", "/login"],
            ["Hướng dẫn sử dụng", "/#guide"],
          ]}
        />
        <div>
          <h2 className="text-sm font-extrabold text-white">Liên hệ</h2>
          <div className="mt-4 space-y-3 text-sm font-medium text-slate-400">
            <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /> 126 Nguyễn Thiện Thành, Trà Vinh</p>
            <a href="mailto:support@tvu.edu.vn" className="flex gap-2 hover:text-white hover:underline">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /> support@tvu.edu.vn
            </a>
            <a href="tel:+842943855246" className="flex gap-2 hover:text-white hover:underline">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /> 0294 3855 246
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h2 className="text-sm font-extrabold text-white">{title}</h2>
      <nav className="mt-4 grid gap-3 text-sm font-medium text-slate-400" aria-label={title}>
        {links.map(([label, to]) => (
          <Link key={label} to={to} className="w-fit hover:text-white hover:underline">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
