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
import { isSafeImageUrl } from "../../utils/safeImageUrl";

const features = [
  {
    icon: Zap,
    title: "Đăng ký nhanh chóng",
    description: "Giao diện tối giản giúp sinh viên tìm kiếm và đặt vé sự kiện chỉ trong vài cú nhấp chuột.",
    tone: "text-brand-700 bg-info-50",
  },
  {
    icon: QrCode,
    title: "Vé QR Code",
    description: "Mỗi vé phát hành đi kèm một mã QR duy nhất, đảm bảo tính bảo mật và dễ dàng truy xuất từ điện thoại.",
    tone: "text-secondary-700 bg-secondary-50",
  },
  {
    icon: ScanLine,
    title: "Check-in tiện lợi",
    description: "Ban tổ chức dễ dàng quét mã QR tại cổng sự kiện để xác nhận tham gia nhanh chóng và chính xác.",
    tone: "text-accent-600 bg-info-50",
  },
  {
    icon: ShieldCheck,
    title: "Chống vé ảo",
    description: "Hệ thống đồng bộ dữ liệu sinh viên trực tiếp, ngăn chặn tình trạng đầu cơ hoặc đăng ký ảo.",
    // Was rose-700, which is this system's danger colour -- a protective feature was wearing
    // the palette's error hue. Green reads as "safe", which is what the feature actually is.
    tone: "text-success-700 bg-success-50",
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
    case "CLOSED":
      return "Đã đóng đăng ký";
    default:
      return "Bản nháp";
  }
}

function eventStatusClass(status: Event["status"]) {
  if (status === "OPEN") return "border-success-200 bg-success-50 text-success-700";
  if (status === "CLOSED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-600";
}

/** One figure on the hero rail. Rendered as dt/dd so the number keeps its label programmatically,
 *  which a bare pair of divs would not. The divider is drawn on the element rather than with a
 *  wrapper so the row can wrap on narrow screens without leaving a dangling rule. */
function HeroStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="w-[15rem] shrink-0 border-r border-info-100 px-6 text-center">
      <dd className={`font-display text-3xl font-extrabold tracking-tight sm:text-4xl ${tone}`}>
        {value.toLocaleString("vi-VN")}
      </dd>
      <dt className="mt-1 whitespace-nowrap text-xs font-bold text-slate-600">{label}</dt>
    </div>
  );
}

/** Split into words, then characters, so each letter can be offset in turn. Words stay
 *  inline-block to keep Vietnamese from breaking mid-word, and the spaces between them remain
 *  real text nodes so the line still wraps and still copies as plain prose. */
function JumpingText({ text }: { text: string }) {
  let charIndex = 0;
  return (
    <>
      {text.split(" ").map((word, wordIndex, words) => (
        <span key={`${word}-${wordIndex}`} className="inline-block">
          {[...word].map((char, i) => (
            <span
              key={i}
              className="landing-jump-char"
              style={{ animationDelay: `${charIndex++ * 28}ms` }}
            >
              {char}
            </span>
          ))}
          {wordIndex < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

function sortFeatured(events: Event[]) {
  const rank: Record<Event["status"], number> = { OPEN: 0, CLOSED: 1, DRAFT: 2 };
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

  // Headline figures for the hero strip. The school-wide /admin/stats, /events/stats and
  // /ticketing/stats endpoints all require a session, so a public page cannot read them —
  // everything here is derived from the public event list instead.
  const heroStats = useMemo(() => {
    const open = events.filter((event) => event.status === "OPEN");
    // remainingTickets is a fallback value when availabilityUnknown is set, so those events are
    // left out of the seat sums. A confident-looking total built partly on guesses is worse than
    // a smaller honest one.
    const withKnownSeats = open.filter((event) => !event.availabilityUnknown);
    return {
      openEvents: open.length,
      clubs: new Set(open.map((event) => event.clubId)).size,
      registered: withKnownSeats.reduce(
        (total, event) => total + Math.max(event.capacity - event.remainingTickets, 0),
        0,
      ),
      seatsLeft: withKnownSeats.reduce((total, event) => total + Math.max(event.remainingTickets, 0), 0),
    };
  }, [events]);

  useEffect(() => {
    document.title = "TVU Ticket | Hệ thống quản lý vé sự kiện";
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadEvents() {
      setIsLoading(true);
      setError("");
      try {
        // The whole public list, not just the featured slice: the hero stat strip sums across
        // every open event, and slicing first would understate every figure.
        const data = await eventService.getPublicEvents();
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
        className="landing-hero relative isolate scroll-mt-16 overflow-hidden bg-white"
      >
        {/* Purely decorative here: the campus is the mood, not information the copy depends on,
            so it carries an empty alt rather than repeating the headline to a screen reader. */}
        <img
          src="/DJI_0431.jpg"
          alt=""
          aria-hidden="true"
          className="landing-hero-photo absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
        />
        {/* Blur alone does not create contrast -- a bright sky behind dark text is still bright.
            The white scrim is what makes the headline readable; the blur just stops the building
            edges from reading as noise behind the letterforms. */}
        <div className="landing-hero-scrim absolute inset-0" aria-hidden="true" />
        <div className="landing-hero-aura absolute inset-0" aria-hidden="true" />

        <div className="landing-hero-copy relative z-10 mx-auto w-full max-w-[1180px] px-5 pb-16 pt-24 text-center md:px-8 md:pb-20 md:pt-28">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <h1 className="landing-fade-up font-display text-4xl font-semibold leading-[1.12] tracking-[-0.02em] text-slate-950 sm:text-5xl lg:text-6xl">
              Quản lý vé sự kiện <span className="text-brand-600">đơn giản, minh bạch</span> và an toàn
            </h1>
            <p className="landing-fade-up mt-6 max-w-2xl text-base font-medium leading-7 text-slate-600 md:text-lg">
              <JumpingText text="Đăng ký, duyệt và check-in sự kiện bằng vé QR điện tử — dành cho sinh viên và các câu lạc bộ trực thuộc Trường Đại học Trà Vinh." />
            </p>
            <div className="landing-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="btn-press group inline-flex h-13 items-center justify-center gap-2 rounded-chip bg-brand-600 px-8 text-sm font-extrabold text-white shadow-lg shadow-brand-700/25 hover:bg-brand-700"
              >
                Đăng nhập ngay <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link
                to="/#guide"
                className="btn-press inline-flex h-13 items-center justify-center gap-1.5 rounded-chip px-6 text-sm font-bold text-brand-700 hover:bg-info-50"
              >
                Xem hướng dẫn <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Deliberately not cards. These four figures used to be StatisticCard tiles sitting
              directly above the four feature cards -- same grid, same breakpoints, so the page
              repeated itself, and the louder tinted tiles outweighed the value proposition they
              were meant to support. A quiet divided rail states the evidence without competing. */}
          <div className="landing-fade-up landing-stat-marquee mx-auto mt-14 max-w-4xl rounded-card border border-info-100 bg-white/70 py-5 backdrop-blur-sm">
            <div className="landing-stat-track">
              {/* The track holds the four figures twice. The animation travels exactly half the
                  track width, so the second copy lands where the first began and the loop has no
                  visible seam. The duplicate is hidden from assistive tech, which would otherwise
                  announce every figure twice. */}
              {[0, 1].map((copy) => (
                <dl key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 || undefined}>
                  <HeroStat label="Sự kiện đang mở" value={heroStats.openEvents} tone="text-brand-600" />
                  <HeroStat label="Câu lạc bộ tổ chức" value={heroStats.clubs} tone="text-success-600" />
                  <HeroStat label="Lượt đã đăng ký" value={heroStats.registered} tone="text-warning-600" />
                  <HeroStat label="Chỗ còn trống" value={heroStats.seatsLeft} tone="text-secondary-600" />
                </dl>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="landing-main-shell relative z-20 -mt-12 overflow-hidden rounded-t-[2rem] bg-white md:-mt-16 md:rounded-t-[3rem]">
        <RevealOnScroll as="section" id="features" className="scroll-mt-20 px-5 py-20 md:px-8 md:py-24">
          <div className="mx-auto max-w-[1180px]">
            <div className="landing-section-heading mx-auto max-w-2xl text-center">
              <h2 id="features-title" className="font-display text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">Tại sao chọn TVU Ticket?</h2>
              <p className="mt-4 text-sm font-medium leading-7 text-slate-600 md:text-base">
                Một nền tảng thống nhất cho toàn bộ hành trình sự kiện — từ đăng ký, xét duyệt đến check-in tại cổng.
              </p>
            </div>

            {/* Bento rather than a fourth identical 4-across row: the lead feature takes a
                double-height tile, the second a wide one, the last two sit small beneath. Four
                equal cards gave every feature the same weight and made this section a visual
                repeat of the block above it. */}
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <RevealOnScroll className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
                <FeatureCard feature={features[0]} featured />
              </RevealOnScroll>
              <RevealOnScroll delay={80} className="sm:col-span-2 lg:col-span-2">
                <FeatureCard feature={features[1]} />
              </RevealOnScroll>
              <RevealOnScroll delay={160}>
                <FeatureCard feature={features[2]} />
              </RevealOnScroll>
              <RevealOnScroll delay={240}>
                <FeatureCard feature={features[3]} />
              </RevealOnScroll>
            </div>
          </div>
        </RevealOnScroll>

        <section id="events" className="landing-soft-section relative scroll-mt-20 px-0 py-20 md:py-24">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-5 text-center md:px-8">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">Sự kiện nổi bật</h2>
            <Link
              to="/login"
              className="group inline-flex w-fit items-center gap-2 rounded-chip border border-info-200 bg-white px-5 py-2.5 text-sm font-bold text-brand-800 shadow-sm transition hover:border-brand-300 hover:bg-info-50"
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
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">Bắt đầu thật đơn giản</h2>
              <p className="mt-4 text-sm font-medium leading-7 text-slate-600 md:text-base">
                Quy trình rõ ràng cho sinh viên, Ban tổ chức và đội ngũ check-in.
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {guideSteps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <RevealOnScroll key={item.title} delay={index * 90}>
                    <article className="landing-guide-card enterprise-card h-full p-6">
                      <div className="flex items-start gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-info-50 text-brand-700">
                          <Icon className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="font-display text-lg font-extrabold text-slate-900">{item.title}</h3>
                          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.description}</p>
                        </div>
                      </div>

                      <ol className="mt-6 space-y-3">
                        {item.steps.map((step, stepIndex) => (
                          <li key={step} className="landing-guide-step flex items-center gap-3 rounded-control border border-slate-100 bg-slate-50 px-3 py-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-extrabold text-brand-700 shadow-sm ring-1 ring-info-100">
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
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-info-100/85 md:text-base">
                Đăng nhập bằng tài khoản Microsoft của trường để đăng ký sự kiện và nhận vé QR ngay khi được duyệt.
              </p>
            </div>
            <Link
              to="/login"
              className="btn-press group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-chip bg-white px-7 text-sm font-extrabold text-brand-800 shadow-lg shadow-slate-950/20 hover:bg-info-50"
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

/** `featured` is the bento's lead tile: it occupies twice the height of its neighbours, so its
 *  icon and heading scale up to fill that space rather than leaving it empty. */
function FeatureCard({ feature, featured = false }: { feature: FeatureItem; featured?: boolean }) {
  const Icon = feature.icon;

  return (
    <article
      className={`landing-feature-card group flex h-full flex-col rounded-card border border-slate-200/80 bg-white ${featured ? "justify-center p-8" : "p-6"}`}
    >
      <div
        className={`grid shrink-0 place-items-center rounded-control transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 ${feature.tone} ${featured ? "h-16 w-16" : "h-12 w-12"}`}
      >
        <Icon className={featured ? "h-7 w-7" : "h-5 w-5"} aria-hidden="true" />
      </div>
      <h3
        className={`font-display font-extrabold text-slate-900 ${featured ? "mt-6 text-2xl" : "mt-5 text-lg"}`}
      >
        {feature.title}
      </h3>
      <p
        className={`font-medium leading-6 text-slate-600 ${featured ? "mt-4 max-w-md text-base leading-7" : "mt-3 text-sm"}`}
      >
        {feature.description}
      </p>
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
    <article className="landing-event-card group overflow-hidden rounded-card border border-slate-200/80 bg-white">
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-900">
        {isSafeImageUrl(event.bannerUrl) ? (
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
        <span className={`absolute right-3 top-3 rounded-chip border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur ${eventStatusClass(event.status)}`}>
          {eventStatusLabel(event.status)}
        </span>
      </div>

      <div className="flex min-h-[242px] flex-col p-6">
        {event.clubName && <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-brand-600">{event.clubName}</p>}
        <h3 className="mt-2 line-clamp-2 font-display text-lg font-extrabold leading-snug text-slate-900">{event.title}</h3>
        <div className="mt-4 space-y-2 text-sm font-medium text-slate-600">
          <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" /> {formatDateTime(event.startAt)}</p>
          <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" /> <span className="line-clamp-1">{event.location}</span></p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-600" />
            {event.remainingTickets > 0 ? `Còn ${event.remainingTickets}/${event.capacity} vé` : "Không còn vé khả dụng"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpen(event.id)}
          className={[
            "btn-press group/btn mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-bold",
            isAvailable
              ? "bg-brand-800 text-white hover:bg-brand-600"
              : "border border-info-200 bg-white text-brand-800 hover:bg-info-50",
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
    <footer className="bg-brand-900 px-5 py-14 text-slate-300 md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <img src="/logo-tvu.webp?v=20260729" alt="Logo TVU" className="h-10 w-10 rounded-full bg-white object-contain ring-2 ring-white/15" />
            <p className="font-display text-xl font-extrabold text-white">TVU Ticket</p>
          </div>
          <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-slate-400">
            Hệ thống quản lý và phân phối vé sự kiện chính thức dành cho sinh viên và các Câu lạc bộ trực thuộc Trường Đại học Trà Vinh.
          </p>
          <div className="mt-5 flex gap-3 text-brand-300" aria-hidden="true">
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
            <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /> 126 Nguyễn Thiện Thành, Trà Vinh</p>
            <a href="mailto:support@tvu.edu.vn" className="flex gap-2 hover:text-white hover:underline">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /> support@tvu.edu.vn
            </a>
            <a href="tel:+842943855246" className="flex gap-2 hover:text-white hover:underline">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /> 0294 3855 246
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
