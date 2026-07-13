import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  GraduationCap,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import CursorGlow from "../../components/common/CursorGlow";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import ScrollToTopButton from "../../components/common/ScrollToTopButton";

const featuredEvents = [
  {
    title: "Ngày hội Công nghệ sinh viên",
    club: "CLB Công nghệ thông tin",
    time: "20/07/2026",
    location: "Hội trường D5",
    status: "Đang mở đăng ký",
    tone: "emerald",
  },
  {
    title: "Workshop Kỹ năng CV & Phỏng vấn",
    club: "Đoàn khoa Kỹ thuật Công nghệ",
    time: "22/07/2026",
    location: "Phòng Lab 2",
    status: "Sắp diễn ra",
    tone: "brand",
  },
  {
    title: "Tập huấn Ban tổ chức sự kiện",
    club: "Phòng Công tác Sinh viên",
    time: "25/07/2026",
    location: "Hội trường Trung tâm",
    status: "Nội bộ",
    tone: "amber",
  },
];

const guideItems = [
  {
    icon: GraduationCap,
    title: "Sinh viên",
    steps: ["Đăng nhập tài khoản trường", "Xem sự kiện phù hợp", "Gửi đăng ký và chờ duyệt", "Nhận vé QR để check-in"],
    description:
      "Sinh viên theo dõi trạng thái đăng ký, xem vé QR sau khi được duyệt và sử dụng vé để check-in một lần tại sự kiện.",
  },
  {
    icon: ClipboardCheck,
    title: "Ban tổ chức / CLB",
    steps: ["Tạo sự kiện", "Duyệt hoặc từ chối đăng ký", "Phát vé QR", "Quét check-in và xem thống kê"],
    description:
      "Ban tổ chức vận hành sự kiện trong phạm vi CLB, quản lý danh sách đăng ký, vé đã cấp và lịch sử check-in minh bạch.",
  },
  {
    icon: ShieldCheck,
    title: "Quản trị viên",
    steps: ["Quản lý CLB", "Quản lý tài khoản BTC", "Theo dõi toàn trường", "Kiểm tra nhật ký hệ thống"],
    description:
      "Quản trị viên giám sát hoạt động toàn hệ thống, kiểm tra số liệu và audit logs để hỗ trợ vận hành cấp trường.",
  },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from(".landing-hero-copy > *", {
        y: 24,
        opacity: 0,
        duration: 0.72,
        stagger: 0.08,
        ease: "power3.out",
      });

      gsap.from(".landing-benefit-card", {
        y: 18,
        opacity: 0,
        duration: 0.58,
        stagger: 0.08,
        delay: 0.42,
        ease: "power2.out",
      });
    },
    { scope: rootRef },
  );

  return (
    <main ref={rootRef} className="subtle-gradient-bg relative isolate w-full max-w-full overflow-x-hidden text-left">
      <CursorGlow />
      <div className="pointer-events-none absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-200/24 blur-3xl landing-soft-orb" aria-hidden="true" />
      <div className="pointer-events-none absolute right-0 top-[22rem] h-52 w-52 rounded-full bg-accent-400/18 blur-3xl landing-soft-orb landing-soft-orb-delay" aria-hidden="true" />
      <div className="relative z-10">
      <section id="home" className="relative scroll-mt-16 overflow-hidden px-5 py-16 md:px-8 md:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,47,44,0.1),transparent_46%,rgba(231,182,90,0.14))]" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/80" aria-hidden="true" />

        <div className="landing-hero-copy relative mx-auto flex max-w-6xl flex-col items-center text-center">
          <p className="landing-hero-kicker inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-800 shadow-sm">
            <ShieldCheck className="h-4 w-4 landing-icon-pulse" /> TVU Event Ticketing Platform
          </p>
          <h1 className="landing-title mt-7 max-w-4xl font-display text-4xl font-semibold leading-tight text-slate-950 md:text-5xl">
            <span className="landing-title-line">Quản lý sự kiện và vé QR</span>
            <span className="landing-gradient-text landing-title-line"> cho CLB Đại học Trà Vinh</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base font-normal leading-7 text-slate-600 md:text-lg">
            Nền tảng hỗ trợ tạo sự kiện, duyệt đăng ký, phát vé điện tử và check-in QR một lần cho sinh viên, ban tổ chức và quản trị viên.
          </p>
          <Link
            to="/login"
            className="btn-press mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-800 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-800/18 hover:bg-brand-700"
          >
            Đăng nhập hệ thống <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="mt-12 grid w-full grid-flow-dense gap-3 md:grid-cols-3">
            {[
              ["Đăng ký chờ duyệt", "Sinh viên gửi đăng ký, Ban tổ chức xác nhận trước khi phát vé."],
              ["Vé QR một lần", "Vé hợp lệ được kiểm tra trạng thái và chặn check-in trùng."],
              ["Quản trị toàn trường", "Super Admin theo dõi CLB, tài khoản BTC và nhật ký hệ thống."],
            ].map(([title, text]) => (
              <div key={title} className="landing-benefit-card rounded-2xl border border-white/80 bg-white/72 p-5 text-left shadow-sm backdrop-blur">
                <p className="font-display text-base font-semibold text-slate-950">{title}</p>
                <p className="mt-2 text-sm font-normal leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <RevealOnScroll as="section" id="events" className="scroll-mt-16 px-5 py-14 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Sự kiện</p>
            <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Sự kiện nổi bật</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Theo dõi các hoạt động học thuật, CLB, hội thảo và chương trình sinh viên đang mở đăng ký trên hệ thống.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {featuredEvents.map((event, index) => (
              <RevealOnScroll key={event.title} delay={index * 90} className="landing-event-card enterprise-card card-hover-lift flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="landing-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      event.tone === "emerald"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : event.tone === "amber"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-brand-200 bg-brand-50 text-brand-700",
                    ].join(" ")}
                  >
                    {event.status}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-base font-semibold leading-snug text-slate-950">{event.title}</h3>
                <p className="mt-1 text-sm font-medium text-brand-700">{event.club}</p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <FileClock className="h-4 w-4 text-slate-400" />
                    {event.time}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {event.location}
                  </p>
                </div>
                <Link
                  to="/login"
                  className="btn-press mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 text-sm font-medium text-brand-800 hover:bg-brand-50"
                >
                  Đăng nhập để đăng ký
                </Link>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" id="guide" className="scroll-mt-16 px-5 py-14 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Hướng dẫn</p>
            <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Hướng dẫn sử dụng</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ba nhóm người dùng dùng chung một quy trình dữ liệu: đăng ký, duyệt, phát vé QR và ghi nhận check-in.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {guideItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="landing-guide-card enterprise-card card-hover-lift p-5">
                  <div className="landing-card-icon grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  <div className="mt-5 space-y-2">
                    {item.steps.map((step, index) => (
                      <div key={step} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-brand-700 ring-1 ring-slate-200">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{step}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 pb-16 pt-6 md:px-8">
        <div className="landing-cta-panel mx-auto max-w-[1180px] rounded-2xl bg-gradient-to-r from-brand-800 to-brand-600 p-7 text-center text-white shadow-xl shadow-brand-900/16 md:p-8">
          <div className="landing-floating-badge mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white/12 text-white ring-1 ring-white/18">
            <Ticket className="h-5 w-5" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">Sẵn sàng quản lý sự kiện CLB chuyên nghiệp hơn?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-normal leading-6 text-white/78">
            Đăng nhập bằng tài khoản TVU để tiếp tục với đúng vai trò của bạn trong hệ thống.
          </p>
          <Link to="/login" className="btn-press mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-brand-800">
            Đăng nhập hệ thống
          </Link>
        </div>
      </RevealOnScroll>
      </div>

      <ScrollToTopButton />
    </main>
  );
}
