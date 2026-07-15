import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
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
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import EmptyState from "../../components/common/EmptyState";
import FAQAccordion from "../../components/common/FAQAccordion";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import ScrollToTopButton from "../../components/common/ScrollToTopButton";
import { eventService } from "../../services/eventService";
import { Event } from "../../types/event";
import { formatDateTime } from "../../utils/formatDate";

gsap.registerPlugin(ScrollTrigger);

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

const faqItems = [
  {
    question: "Làm sao để đăng ký tham gia một sự kiện?",
    answer:
      "Đăng nhập bằng tài khoản TVU của bạn, chọn sự kiện đang mở đăng ký và gửi yêu cầu tham dự. Đăng ký của bạn sẽ ở trạng thái chờ duyệt cho đến khi Ban tổ chức CLB xác nhận.",
  },
  {
    question: "Vé điện tử và mã QR hoạt động như thế nào?",
    answer:
      "Sau khi đăng ký được duyệt, hệ thống phát hành một vé điện tử kèm mã QR duy nhất cho tài khoản của bạn. Bạn xuất trình mã QR này tại cổng sự kiện để Ban tổ chức quét và xác nhận tham dự.",
  },
  {
    question: "Vì sao đăng ký của tôi vẫn ở trạng thái chờ duyệt?",
    answer:
      "Mỗi đăng ký cần được Ban tổ chức CLB duyệt thủ công để đảm bảo đúng số lượng vé còn lại. Bạn có thể theo dõi trạng thái mới nhất trong mục Đăng ký của tôi sau khi đăng nhập.",
  },
  {
    question: "Một vé đã check-in có thể dùng lại được không?",
    answer:
      "Không. Mỗi mã QR chỉ hợp lệ cho một lượt check-in duy nhất, giúp ngăn chặn tình trạng chia sẻ vé hoặc quét lại vé đã sử dụng.",
  },
  {
    question: "Câu lạc bộ muốn tổ chức sự kiện thì cần làm gì?",
    answer:
      "Tài khoản Ban tổ chức của từng CLB được quản trị viên nhà trường cấp và phân quyền. Sau khi đăng nhập bằng tài khoản này, bạn có thể tạo sự kiện, duyệt đăng ký và quét mã QR check-in ngay trong hệ thống.",
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

function useFinePointer() {
  const [isFinePointer, setIsFinePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setIsFinePointer(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isFinePointer;
}

interface PointerMotionOptions {
  enabled: boolean;
  tilt?: boolean;
  maxTilt?: number;
  magnetic?: boolean;
  maxMagnet?: number;
}

function usePointerMotion<T extends HTMLElement>({
  enabled,
  tilt = false,
  maxTilt = 3,
  magnetic = false,
  maxMagnet = 4,
}: PointerMotionOptions) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return undefined;

    let raf = 0;

    const reset = () => {
      node.style.setProperty("--tilt-x", "0deg");
      node.style.setProperty("--tilt-y", "0deg");
      node.style.setProperty("--magnet-x", "0px");
      node.style.setProperty("--magnet-y", "0px");
      node.classList.remove("is-pointer-active");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const normalizedX = x / rect.width - 0.5;
        const normalizedY = y / rect.height - 0.5;

        node.classList.add("is-pointer-active");
        node.style.setProperty("--mouse-x", `${x}px`);
        node.style.setProperty("--mouse-y", `${y}px`);

        if (tilt) {
          node.style.setProperty("--tilt-x", `${normalizedY * -maxTilt}deg`);
          node.style.setProperty("--tilt-y", `${normalizedX * maxTilt}deg`);
        }

        if (magnetic) {
          node.style.setProperty("--magnet-x", `${normalizedX * maxMagnet}px`);
          node.style.setProperty("--magnet-y", `${normalizedY * maxMagnet}px`);
        }
      });
    };

    const handlePointerLeave = () => reset();

    node.addEventListener("pointermove", handlePointerMove, { passive: true });
    node.addEventListener("pointerleave", handlePointerLeave);
    node.addEventListener("blur", handlePointerLeave, true);

    return () => {
      window.cancelAnimationFrame(raf);
      node.removeEventListener("pointermove", handlePointerMove);
      node.removeEventListener("pointerleave", handlePointerLeave);
      node.removeEventListener("blur", handlePointerLeave, true);
    };
  }, [enabled, magnetic, maxMagnet, maxTilt, tilt]);

  return ref;
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
  const finePointer = useFinePointer();
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

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || reducedMotion || !finePointer) return undefined;

    let raf = 0;
    const handlePointerMove = (event: PointerEvent) => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        hero.style.setProperty("--hero-x", `${x * 12}px`);
        hero.style.setProperty("--hero-y", `${y * 10}px`);
        hero.style.setProperty("--hero-rot-x", `${y * -6}deg`);
        hero.style.setProperty("--hero-rot-y", `${x * 8}deg`);
        hero.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
        hero.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
        hero.classList.add("is-pointer-active");
      });
    };

    const handlePointerLeave = () => {
      hero.style.setProperty("--hero-x", "0px");
      hero.style.setProperty("--hero-y", "0px");
      hero.style.setProperty("--hero-rot-x", "0deg");
      hero.style.setProperty("--hero-rot-y", "0deg");
      hero.classList.remove("is-pointer-active");
    };

    hero.addEventListener("pointermove", handlePointerMove, { passive: true });
    hero.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(raf);
      hero.removeEventListener("pointermove", handlePointerMove);
      hero.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [finePointer, reducedMotion]);

  useGSAP(
    () => {
      if (reducedMotion) return;

      gsap.from(".landing-hero-word", {
        y: 24,
        opacity: 0,
        duration: 0.72,
        stagger: 0.055,
        ease: "power3.out",
      });

      gsap.from(".landing-hero-copy .landing-fade-up", {
        y: 18,
        opacity: 0,
        duration: 0.65,
        stagger: 0.12,
        delay: 0.28,
        ease: "power2.out",
      });

      gsap.to(".landing-hero-bg", {
        yPercent: 9,
        ease: "none",
        scrollTrigger: {
          trigger: ".landing-hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.from(".landing-section-heading", {
        y: 18,
        opacity: 0,
        duration: 0.58,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#features",
          start: "top 75%",
        },
      });
    },
    { scope: rootRef, dependencies: [reducedMotion] },
  );

  return (
    <div ref={rootRef} className="landing-page relative w-full max-w-full overflow-x-hidden bg-slate-50 text-left text-slate-900">
      <section
        id="home"
        ref={heroRef}
        className="landing-hero relative isolate min-h-[calc(100vh-4rem)] scroll-mt-16 overflow-hidden"
      >
        <img
          src="/DJI_0431.jpg"
          alt="Khuôn viên Trường Đại học Trà Vinh nhìn từ trên cao"
          className="landing-hero-bg absolute inset-0 h-[112%] w-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/68 via-white/38 to-white/84" aria-hidden="true" />
        <div className="landing-hero-spotlight absolute inset-0" aria-hidden="true" />
        <div className="landing-depth absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(37,99,235,0.16),transparent_34%)]" aria-hidden="true" />

        <div className="landing-hero-copy relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[1180px] items-center gap-10 px-5 py-20 text-center md:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:text-left">
          <div className="flex flex-col items-center lg:items-start">
            <p className="landing-fade-up inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/72 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-800 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" /> TVU Ticket
            </p>
            <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-tight text-blue-900 sm:text-5xl lg:text-6xl">
              <span className="sr-only">Hệ thống quản lý vé sự kiện chuyên nghiệp</span>
              <span aria-hidden="true">
                {"Hệ thống quản lý vé sự kiện chuyên nghiệp".split(" ").map((word, index) => (
                  <span key={`${word}-${index}`} className="landing-hero-word inline-block px-1">
                    {word}
                  </span>
                ))}
              </span>
            </h1>
            <p className="landing-fade-up mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-700 md:text-lg">
              Trải nghiệm đăng ký, check-in và quản lý sự kiện liền mạch, minh bạch dành cho sinh viên và các câu lạc bộ TVU.
            </p>
            <div className="landing-fade-up mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/events"
                className="btn-press magnetic-button group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-800 px-7 text-sm font-bold text-white shadow-xl shadow-blue-900/20 hover:bg-blue-700"
              >
                <MagneticContent enabled={finePointer && !reducedMotion}>
                  Xem sự kiện <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </MagneticContent>
              </Link>
              <Link
                to="/login"
                className="btn-press magnetic-button inline-flex h-12 items-center justify-center rounded-xl border border-blue-800 bg-white/78 px-7 text-sm font-bold text-blue-900 shadow-md shadow-blue-950/8 backdrop-blur hover:bg-white"
              >
                <MagneticContent enabled={finePointer && !reducedMotion}>Đăng nhập</MagneticContent>
              </Link>
            </div>
          </div>

          <HeroShowcase3D />
        </div>
      </section>

      <RevealOnScroll as="section" id="features" className="scroll-mt-20 bg-slate-50 px-5 py-16 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="landing-section-heading mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold text-blue-900 md:text-4xl">Tại sao chọn TVU Ticket?</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 md:text-base">
              Giải pháp toàn diện cho mọi nhu cầu tổ chức sự kiện của bạn.
            </p>
          </div>

          <div className="mt-10 grid auto-rows-fr gap-5 md:grid-cols-2">
            {features.map((feature, index) => {
              return (
                <RevealOnScroll key={feature.title} delay={index * 80} className={index === 0 || index === 3 ? "lg:col-span-1" : ""}>
                  <FeatureCard feature={feature} motionEnabled={finePointer && !reducedMotion} />
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <section id="events" className="scroll-mt-20 border-y border-slate-200 bg-white px-0 py-16">
        <div className="mx-auto max-w-[1180px] px-5 text-center md:px-8">
          <h2 className="font-display text-3xl font-extrabold text-blue-900 md:text-4xl">Sự kiện nổi bật</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 md:text-base">
            Khám phá các hoạt động hấp dẫn sắp diễn ra.
          </p>
        </div>

        <div className="mt-10">
          {isLoading ? (
            <div className="mx-auto max-w-[1180px] px-5 md:px-8">
              <LoadingSkeleton type="card" count={3} />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-[1180px] px-5 md:px-8">
              <EmptyState title="Chưa tải được sự kiện" description={error} icon={CalendarDays} />
            </div>
          ) : visibleEvents.length > 0 ? (
            <EventMarquee events={visibleEvents} reducedMotion={reducedMotion} motionEnabled={finePointer && !reducedMotion} onOpen={(eventId) => navigate(`/events/${eventId}`)} />
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

      <RevealOnScroll as="section" id="guide" className="scroll-mt-20 bg-slate-50 px-5 py-16 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-white text-blue-800 shadow-sm">
              <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-display text-3xl font-extrabold text-blue-900 md:text-4xl">Hướng dẫn sử dụng</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 md:text-base">
              Nắm nhanh quy trình đăng ký, quản lý và check-in sự kiện trên TVU Ticket.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {guideSteps.map((item, index) => {
              const Icon = item.icon;
              return (
                <RevealOnScroll key={item.title} delay={index * 90}>
                  <article className="landing-guide-card h-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/4">
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

      <RevealOnScroll as="section" id="faq" className="scroll-mt-20 border-t border-slate-200 bg-white px-5 py-16 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold text-blue-900 md:text-4xl">Câu hỏi thường gặp</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 md:text-base">
              Một số thắc mắc phổ biến về đăng ký, vé điện tử và check-in trên TVU Ticket.
            </p>
          </div>

          <div className="mt-10">
            <FAQAccordion items={faqItems} />
          </div>
        </div>
      </RevealOnScroll>

      <LandingFooter />
      <ScrollToTopButton />
    </div>
  );
}

interface EventMarqueeProps {
  events: Event[];
  reducedMotion: boolean;
  motionEnabled: boolean;
  onOpen: (eventId: string) => void;
}

type FeatureItem = (typeof features)[number];

function HeroShowcase3D() {
  return (
    <div className="landing-hero-3d hidden lg:block" aria-hidden="true">
      <div className="landing-hero-3d-stage">
        <div className="landing-hero-3d-card landing-hero-3d-card-back" />
        <div className="landing-hero-3d-card landing-hero-3d-ticket">
          <div className="flex items-center gap-2 text-blue-800">
            <Ticket className="h-5 w-5" />
            <span className="text-xs font-extrabold uppercase tracking-[0.14em]">Vé điện tử</span>
          </div>
          <p className="mt-4 font-display text-lg font-extrabold leading-snug text-slate-900">Tên sự kiện của bạn</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Thời gian · Địa điểm</p>
          <div className="landing-hero-3d-divider" />
          <div className="landing-hero-3d-qr">
            <QrCode className="h-16 w-16 text-slate-900" strokeWidth={1.4} />
          </div>
          <span className="landing-hero-3d-status">
            <CheckCircle2 className="h-3.5 w-3.5" /> Vé hợp lệ
          </span>
        </div>
        <div className="landing-hero-3d-badge landing-hero-3d-badge-scan">
          <ScanLine className="h-4 w-4" /> Check-in
        </div>
        <div className="landing-hero-3d-badge landing-hero-3d-badge-shield">
          <ShieldCheck className="h-4 w-4" /> Chống vé ảo
        </div>
      </div>
    </div>
  );
}

function MagneticContent({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = usePointerMotion<HTMLSpanElement>({ enabled, magnetic: true, maxMagnet: 5 });

  return (
    <span ref={ref} className="magnetic-button-content">
      {children}
    </span>
  );
}

function FeatureCard({ feature, motionEnabled }: { feature: FeatureItem; motionEnabled: boolean }) {
  const Icon = feature.icon;
  const cardRef = usePointerMotion<HTMLElement>({ enabled: motionEnabled, tilt: true, maxTilt: 3 });

  return (
    <article ref={cardRef} className="landing-feature-card group h-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/4">
      <div className={`landing-feature-icon grid h-12 w-12 place-items-center rounded-xl ${feature.tone}`}>
        <Icon className="h-6 w-6 transition duration-300 group-hover:scale-110" />
      </div>
      <h3 className="mt-5 font-display text-xl font-extrabold text-slate-900">{feature.title}</h3>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{feature.description}</p>
      <span className="landing-card-light" aria-hidden="true" />
    </article>
  );
}

function EventMarquee({ events, reducedMotion, motionEnabled, onOpen }: EventMarqueeProps) {
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);
  const repeated = useMemo(() => [...events, ...events], [events]);

  useEffect(() => () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
  }, []);

  const pause = () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    setPaused(true);
  };

  const resumeSoon = () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), 420);
  };

  return (
    <div
      className={["landing-marquee", reducedMotion ? "landing-marquee-reduced" : "", paused ? "is-paused" : ""].join(" ")}
      onMouseEnter={pause}
      onMouseLeave={resumeSoon}
      onPointerDown={pause}
      onPointerUp={resumeSoon}
      onPointerCancel={resumeSoon}
      onFocusCapture={pause}
      onBlurCapture={resumeSoon}
    >
      <div className="landing-marquee-track" aria-live="off">
        {repeated.map((event, index) => (
          <LandingEventCard
            key={`${event.id}-${index < events.length ? "primary" : "clone"}`}
            event={event}
            ariaHidden={index >= events.length}
            motionEnabled={motionEnabled}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

interface LandingEventCardProps {
  event: Event;
  ariaHidden?: boolean;
  motionEnabled: boolean;
  onOpen: (eventId: string) => void;
}

function LandingEventCard({ event, ariaHidden = false, motionEnabled, onOpen }: LandingEventCardProps) {
  const isEnded = event.status === "ENDED" || event.status === "CLOSED";
  const isAvailable = event.status === "OPEN" && event.remainingTickets > 0;
  const cardRef = usePointerMotion<HTMLElement>({ enabled: motionEnabled, tilt: true, maxTilt: 2.6 });

  return (
    <article
      ref={cardRef}
      className="landing-event-card group"
      aria-hidden={ariaHidden}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-blue-950">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="h-full w-full object-cover"
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

      <div className="flex min-h-[230px] flex-col p-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-blue-700">{event.clubName || "TVU"}</p>
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
          tabIndex={ariaHidden ? -1 : 0}
          className={[
            "btn-press magnetic-button group/btn mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold",
            isAvailable
              ? "bg-blue-800 text-white shadow-md shadow-blue-900/16 hover:bg-blue-700"
              : "border border-blue-200 bg-white text-blue-800 hover:bg-blue-50",
          ].join(" ")}
        >
          <MagneticContent enabled={motionEnabled && !ariaHidden}>
            {isAvailable ? "Đăng ký ngay" : isEnded ? "Xem chi tiết" : "Xem chi tiết"}
            <ArrowRight className="h-4 w-4 transition group-hover/btn:translate-x-1" />
          </MagneticContent>
        </button>
      </div>
      <span className="landing-card-light" aria-hidden="true" />
    </article>
  );
}

function LandingFooter() {
  return (
    <footer className="bg-slate-50 px-5 py-12 md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-8 border-t border-slate-200 pt-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <img src="/tvu_logo_1783065060265.jpg" alt="Logo TVU" className="h-10 w-10 rounded-full object-contain ring-1 ring-blue-100" />
            <p className="font-display text-xl font-extrabold text-blue-800">TVU Ticket</p>
          </div>
          <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-slate-600">
            Hệ thống quản lý và phân phối vé sự kiện chính thức dành cho sinh viên và các Câu lạc bộ trực thuộc Trường Đại học Trà Vinh.
          </p>
          <div className="mt-5 flex gap-3 text-blue-800" aria-hidden="true">
            <Share2 className="h-4 w-4" />
            <Users className="h-4 w-4" />
          </div>
        </div>
        <FooterColumn
          title="Khám phá"
          links={[
            ["Trang chủ", "/"],
            ["Sự kiện", "/events"],
            ["Hướng dẫn sử dụng", "/#guide"],
            ["Câu hỏi thường gặp", "/#faq"],
          ]}
        />
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Liên hệ</h2>
          <div className="mt-4 space-y-3 text-sm font-medium text-slate-600">
            <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /> 126 Nguyễn Thiện Thành, Trà Vinh</p>
            <p className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /> support@tvu.edu.vn</p>
            <p className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /> 0294 3855 246</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
      <nav className="mt-4 grid gap-3 text-sm font-medium text-slate-600" aria-label={title}>
        {links.map(([label, to]) => (
          <Link key={label} to={to} className="w-fit hover:text-blue-800 hover:underline">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
