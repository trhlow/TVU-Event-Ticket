import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  GraduationCap,
  HelpCircle,
  LockKeyhole,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Star,
  Ticket,
  Users,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import CursorGlow from "../../components/common/CursorGlow";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import ScrollToTopButton from "../../components/common/ScrollToTopButton";

const trustSignals = [
  { value: "3", label: "vai tro chinh", text: "Sinh vien, Ban to chuc va Super Admin" },
  { value: "QR", label: "ve dien tu", text: "Check-in mot lan bang payload signed" },
  { value: "CSRF", label: "cookie bao mat", text: "Dang nhap bang cookie HTTP-only qua gateway" },
];

const featuredEvents = [
  {
    title: "Ngay hoi Cong nghe sinh vien",
    club: "CLB Cong nghe thong tin",
    time: "20/07/2026",
    location: "Hoi truong D5",
    status: "Dang mo dang ky",
    tone: "emerald",
  },
  {
    title: "Workshop Ky nang CV va Phong van",
    club: "Doan khoa Ky thuat Cong nghe",
    time: "22/07/2026",
    location: "Phong Lab 2",
    status: "Sap dien ra",
    tone: "brand",
  },
  {
    title: "Tap huan Ban to chuc su kien",
    club: "Phong Cong tac Sinh vien",
    time: "25/07/2026",
    location: "Hoi truong Trung tam",
    status: "Noi bo",
    tone: "amber",
  },
];

const benefits = [
  {
    icon: CalendarDays,
    title: "Quan ly vong doi su kien",
    text: "CLB tao ban nhap, cap nhat thong tin, mo dang ky va dong su kien theo trang thai backend.",
  },
  {
    icon: ClipboardCheck,
    title: "Duyet dang ky co kiem soat",
    text: "Reservation bat dau o trang thai PENDING, chi cap ve khi Ban to chuc approve thanh cong.",
  },
  {
    icon: QrCode,
    title: "Ve QR dien tu dung nghiep vu",
    text: "Frontend khong tu ky QR. Payload signed duoc backend/notification cap va ticket-service xac minh khi check-in.",
  },
  {
    icon: ScanLine,
    title: "Check-in mot lan",
    text: "Nhan dien ve hop le, chan diem danh trung va cap nhat trang thai CHECKED_IN cho Ban to chuc.",
  },
  {
    icon: BarChart3,
    title: "Theo doi dashboard CLB",
    text: "BTC xem su kien, dang ky cho duyet, ve da cap va tien do check-in trong mot khong gian lam viec.",
  },
  {
    icon: LockKeyhole,
    title: "Phan quyen theo vai tro",
    text: "ProtectedRoute va role-based routes tach rieng Sinh vien, Organizer va Super Admin.",
  },
];

const guideItems = [
  {
    icon: GraduationCap,
    title: "Sinh vien",
    steps: ["Dang nhap tai khoan", "Xem su kien phu hop", "Gui dang ky va cho duyet", "Nhan ve QR de check-in"],
    description:
      "Sinh vien theo doi trang thai dang ky, xem ve sau khi duoc duyet va su dung QR hop le tai diem danh.",
  },
  {
    icon: ClipboardCheck,
    title: "Ban to chuc / CLB",
    steps: ["Tao su kien", "Duyet hoac tu choi", "Phat hanh ve", "Quet QR va xem danh sach tham du"],
    description:
      "Ban to chuc van hanh su kien trong pham vi CLB, khong tu can thiep sai vao capacity hay QR signed.",
  },
  {
    icon: ShieldCheck,
    title: "Super Admin",
    steps: ["Quan ly CLB", "Quan ly Organizer", "Theo doi toan truong", "Kiem tra audit va thong ke"],
    description:
      "Quan tri vien giam sat cac cau lac bo, tai khoan Ban to chuc va du lieu tong quan cua he thong.",
  },
];

const testimonials = [
  {
    name: "Dai dien sinh vien",
    role: "Nguoi dung thu nghiem",
    quote: "Quy trinh dang ky ro rang hon: em biet minh dang cho duyet, da duoc duyet hay can lien he BTC.",
  },
  {
    name: "Ban to chuc CLB",
    role: "Nhom van hanh su kien",
    quote: "Danh sach pending va attendee tach bach giup viec duyet, phat ve va diem danh de kiem soat hon.",
  },
  {
    name: "Giang vien huong dan",
    role: "Goc nhin do an",
    quote: "He thong the hien duoc kien truc phan tan: gateway, auth, event, ticket va notification service.",
  },
  {
    name: "Quan tri he thong",
    role: "Goc nhin van hanh",
    quote: "Cookie auth, CSRF signed token va role-based route giup frontend ton trong ranh gioi bao mat backend.",
  },
];

const faqs = [
  {
    question: "Day co phai trang ban ve thuong mai khong?",
    answer: "Khong. Day la landing page gioi thieu he thong do an quan ly su kien va ve dien tu cho CLB tai Truong Dai hoc Tra Vinh.",
  },
  {
    question: "Sinh vien co nhan QR ngay sau khi dang ky khong?",
    answer: "Khong. Dang ky tao reservation PENDING. Ve QR chi xuat hien sau khi Ban to chuc approve thanh cong.",
  },
  {
    question: "Frontend co tu tao QR signed khong?",
    answer: "Khong. QR ticket/check-in phai do backend va notification flow cap. Frontend chi hien thi hoac gui payload dung contract.",
  },
  {
    question: "Ban to chuc check-in bang cach nao?",
    answer: "Organizer nhap hoac quet QR payload, frontend gui den /ticketing/check-in de backend xac minh chu ky va trang thai ve.",
  },
  {
    question: "He thong bao ve phien dang nhap ra sao?",
    answer: "Frontend dung cookie auth qua gateway va gui X-XSRF-TOKEN cho request thay doi du lieu. JWT khong duoc luu vao localStorage.",
  },
  {
    question: "Notification service co man hinh rieng khong?",
    answer: "Hien khong co endpoint frontend. Email/QR notification xu ly bat dong bo sau khi reservation duoc approve.",
  },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = "TVU Event & Ticketing Platform | Quan ly su kien va ve QR";
  }, []);

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
      <div className="relative z-10">
        <section
          id="home"
          className="relative scroll-mt-16 overflow-hidden px-5 py-16 text-white md:px-8 md:py-24"
          style={{
            backgroundImage:
              "linear-gradient(105deg, rgba(7, 38, 35, 0.94), rgba(8, 75, 67, 0.82), rgba(12, 84, 72, 0.68)), url('/tvu_logo_1783065060265.jpg')",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.16),transparent_36%)]" aria-hidden="true" />
          <div className="landing-hero-copy relative mx-auto flex max-w-6xl flex-col items-center text-center">
            <p className="landing-hero-kicker inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 landing-icon-pulse" /> TVU Event & Ticketing Platform
            </p>
            <h1 className="landing-title mt-7 max-w-4xl font-display text-4xl font-semibold leading-tight text-white md:text-5xl">
              Quan ly su kien CLB va ve QR dien tu cho Truong Dai hoc Tra Vinh
            </h1>
            <p className="mt-5 max-w-3xl text-base font-normal leading-7 text-white/82 md:text-lg">
              He thong ho tro sinh vien dang ky su kien, Ban to chuc duyet ho so, phat hanh ve QR va check-in mot lan, dong thoi giup quan tri vien theo doi hoat dong toan truong.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/login"
                className="btn-press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-brand-800 shadow-lg shadow-brand-950/20 hover:bg-brand-50"
              >
                Dang nhap he thong <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/events"
                className="btn-press inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/24 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/16"
              >
                Xem su kien cong khai
              </Link>
            </div>

            <div className="mt-10 grid w-full gap-3 md:grid-cols-3">
              {trustSignals.map((item) => (
                <div key={item.label} className="rounded-xl border border-white/18 bg-white/12 p-4 text-left backdrop-blur">
                  <p className="font-display text-2xl font-semibold text-white">{item.value}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/70">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-white/74">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <RevealOnScroll as="section" className="px-5 py-14 md:px-8">
          <div className="mx-auto grid max-w-[1180px] gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Demo UI</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Mot luong nghiep vu, ba khong gian lam viec</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Landing page khong thay the ung dung chinh. No gioi thieu nhanh cach he thong ket noi public discovery, student reservation, organizer ticketing va admin management.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["Public", "Student", "Organizer"].map((label) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {label === "Public" ? "Xem su kien mo" : label === "Student" ? "Gui dang ky va xem ve" : "Duyet, cap ve va check-in"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-xl shadow-slate-900/15">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 text-xs font-semibold text-white/50">tvu-event-ticket.app</span>
              </div>
              <div className="grid gap-4 p-5">
                <div className="rounded-xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-700">Organizer dashboard</p>
                      <p className="mt-1 text-sm font-black text-slate-950">Ngay hoi Cong nghe sinh vien</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">OPEN</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      ["Cho duyet", "24"],
                      ["Ve da cap", "168"],
                      ["Da check-in", "96"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-lg font-black text-slate-950">{value}</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="rounded-xl border border-white/10 bg-white/8 p-4 text-white">
                    <p className="text-xs font-bold text-white/60">QR payload</p>
                    <p className="mt-2 break-all font-mono text-xs text-white/86">ticketId.eventId.exp.signature</p>
                  </div>
                  <div className="grid h-28 w-28 grid-cols-7 gap-1 rounded-xl bg-white p-3">
                    {Array.from({ length: 49 }, (_, index) => (
                      <span key={index} className={(index % 2 === 0 || [3, 10, 18, 24, 31, 40].includes(index)) ? "rounded-sm bg-slate-950" : "rounded-sm bg-slate-100"} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" id="events" className="scroll-mt-16 px-5 py-14 md:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Su kien</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Su kien noi bat</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cac su kien mau duoc trinh bay de mo ta trai nghiem public landing. Du lieu van hanh that nam trong ung dung sau dang nhap va cac API backend.
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
                    Dang nhap de dang ky
                  </Link>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" className="px-5 py-14 md:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Loi ich chinh</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Thiet ke dung nghiep vu phan tan</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cac tinh nang tap trung vao bai toan thuc te cua CLB: cong bo su kien, duyet dang ky, phat ve QR, check-in va quan tri.
              </p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {benefits.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="landing-benefit-card enterprise-card card-hover-lift p-5">
                    <div className="landing-card-icon grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-display text-base font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" id="guide" className="scroll-mt-16 px-5 py-14 md:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Huong dan</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Moi vai tro co mot hanh trinh ro rang</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Ba nhom nguoi dung dung chung mot dong du lieu: dang ky, duyet, cap ve QR va ghi nhan check-in.
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

        <RevealOnScroll as="section" className="px-5 py-14 md:px-8">
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">Phan hoi theo ngu canh do an</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Goc nhin tu cac nhom su dung</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Cac nhan xet minh hoa duoc viet theo boi canh hoc thuat, khong phai review thuong mai hay du lieu khao sat chinh thuc.
              </p>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {testimonials.map((item) => (
                <article key={item.name} className="enterprise-card card-hover-lift p-5">
                  <div className="flex gap-1 text-amber-400">
                    {Array.from({ length: 5 }, (_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">"{item.quote}"</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.name}</p>
                      <p className="text-xs font-medium text-slate-500">{item.role}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" className="px-5 py-14 md:px-8">
          <div className="mx-auto max-w-[980px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-section-kicker text-[11px] font-semibold uppercase tracking-wider text-brand-700">FAQ</p>
              <h2 className="landing-section-title mt-2 font-display text-2xl font-semibold text-slate-950">Cau hoi thuong gap</h2>
            </div>
            <div className="mt-8 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {faqs.map((item) => (
                <details key={item.question} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-950">
                    <span>{item.question}</span>
                    <HelpCircle className="h-5 w-5 shrink-0 text-brand-600 transition group-open:rotate-45" />
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" className="px-5 pb-16 pt-6 md:px-8">
          <div className="landing-cta-panel mx-auto max-w-[1180px] rounded-2xl bg-gradient-to-r from-brand-800 to-brand-600 p-7 text-center text-white shadow-xl shadow-brand-900/16 md:p-8">
            <div className="landing-floating-badge mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white/12 text-white ring-1 ring-white/18">
              <Ticket className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold">San sang quan ly su kien CLB chuyen nghiep hon?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-normal leading-6 text-white/78">
              Dang nhap bang tai khoan TVU de tiep tuc voi dung vai tro cua ban trong he thong. Neu ban la khach, hay xem danh sach su kien cong khai truoc.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/login" className="btn-press inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-brand-800">
                Dang nhap he thong
              </Link>
              <Link to="/events" className="btn-press inline-flex h-11 items-center justify-center rounded-xl border border-white/22 bg-white/10 px-5 text-sm font-semibold text-white">
                Xem su kien
              </Link>
            </div>
          </div>
        </RevealOnScroll>

        <RevealOnScroll as="section" className="px-5 pb-16 md:px-8">
          <div className="mx-auto grid max-w-[1180px] gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm md:grid-cols-3">
            <div>
              <p className="font-display text-base font-semibold text-slate-950">TVU Event & Ticketing Platform</p>
              <p className="mt-2 leading-6">De tai: Xay dung he thong phan tan quan ly su kien va ve dien tu cho cac CLB tai Truong Dai hoc Tra Vinh.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-950">Lien he hoc thuat</p>
              <p className="mt-2 leading-6">Truong Dai hoc Tra Vinh</p>
              <p className="leading-6">Phong Cong tac Sinh vien / cac CLB phu trach su kien</p>
            </div>
            <div>
              <p className="font-semibold text-slate-950">Thong tin nen tang</p>
              <p className="mt-2 flex items-center gap-2 leading-6"><Bell className="h-4 w-4 text-brand-600" /> Notification service gui email/QR bat dong bo.</p>
              <p className="flex items-center gap-2 leading-6"><CheckCircle2 className="h-4 w-4 text-brand-600" /> Public URL: /, /events, /login.</p>
            </div>
          </div>
        </RevealOnScroll>
      </div>

      <ScrollToTopButton />
    </main>
  );
}
