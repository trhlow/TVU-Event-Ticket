import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bolt, CheckCircle2, ClipboardCheck, GraduationCap, QrCode, ShieldCheck, Ticket, Users } from "lucide-react";
import RevealOnScroll from "../../components/common/RevealOnScroll";
import EventCard from "../../components/events/EventCard";
import { mockEvents } from "../../data/mockEvents";

export default function LandingPage() {
  const navigate = useNavigate();
  const featuredEvents = mockEvents.slice(0, 3);

  return (
    <div className="subtle-gradient-bg overflow-hidden text-left">
      <section className="relative px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1fr_520px]">
          <div>
            <p className="animate-slide-right inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-brand-800 shadow-sm">
              <ShieldCheck className="h-4 w-4" /> TVU Event & Ticketing Platform
            </p>
            <h1 className="animate-slide-up mt-5 font-display text-5xl font-extrabold leading-tight text-slate-950 md:text-[58px]">
              Quản lý sự kiện và vé QR cho CLB TVU.
            </h1>
            <p className="animate-slide-up mt-6 max-w-[620px] text-lg font-medium leading-8 text-slate-600" style={{ animationDelay: "120ms" }}>
              Sinh viên đăng ký nhanh, Ban tổ chức duyệt minh bạch, Super Admin giám sát toàn trường trong một nền tảng thống nhất.
            </p>
            <div className="animate-slide-up mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "220ms" }}>
              <Link to="/login" className="btn-press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand-700 px-6 text-sm font-bold text-white shadow-lg shadow-brand-700/20 hover:bg-brand-800">
                Đăng nhập hệ thống <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#events" className="btn-press inline-flex min-h-12 items-center justify-center rounded-2xl border border-brand-200 bg-white px-6 text-sm font-bold text-brand-800 hover:bg-brand-50">
                Xem sự kiện
              </a>
            </div>
          </div>

          <div className="animate-scale-in enterprise-card hover-lift soft-glow p-4" style={{ animationDelay: "180ms" }}>
            <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-brand-50 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src="/src/assets/images/tvu_logo_1783065060265.jpg" alt="TVU" className="h-10 w-10 rounded-2xl bg-white object-contain p-1 shadow-sm" />
                  <div>
                    <p className="font-display text-lg font-extrabold text-brand-800">TVU Event</p>
                    <p className="text-xs font-semibold text-slate-500">Live dashboard preview</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">Online</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Sự kiện", "24"],
                  ["Đăng ký", "1.2k"],
                  ["Check-in", "86%"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                    <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
                    <p className="mt-1 font-display text-2xl font-extrabold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white">
                <QrCode className="h-14 w-14 text-accent-400" />
                <p className="mt-4 font-display text-2xl font-extrabold">Vé QR điện tử</p>
                <p className="mt-2 text-sm font-medium text-white/70">Mỗi vé có mã định danh duy nhất, hỗ trợ điểm danh một lần.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RevealOnScroll as="section" id="features" className="px-5 py-12 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="text-center">
            <h2 className="font-display text-3xl font-extrabold text-slate-950">Một nền tảng cho ba vai trò</h2>
            <p className="mt-3 text-base font-medium text-slate-600">Đăng ký, phê duyệt, phát hành vé và quản trị hệ thống trong cùng một luồng dữ liệu.</p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              { icon: Bolt, title: "Sinh viên đăng ký nhanh", desc: "Tìm sự kiện, gửi đăng ký và theo dõi trạng thái xét duyệt." },
              { icon: ClipboardCheck, title: "Organizer vận hành gọn", desc: "Tạo sự kiện, duyệt đăng ký, chia sẻ QR đăng ký và quét vé." },
              { icon: CheckCircle2, title: "Admin giám sát rõ", desc: "Theo dõi CLB, tài khoản Ban tổ chức, phân quyền và audit log." },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <RevealOnScroll key={item.title} delay={index * 90} className="enterprise-card card-hover-lift p-6">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:scale-105">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-xl font-extrabold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.desc}</p>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 py-12 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: GraduationCap, title: "Sinh viên", text: "Xem sự kiện, gửi đăng ký, nhận vé QR sau khi được duyệt." },
              { icon: Users, title: "Ban tổ chức", text: "Quản lý sự kiện CLB, duyệt đăng ký và điểm danh bằng QR." },
              { icon: ShieldCheck, title: "Nhà trường", text: "Theo dõi hoạt động toàn trường, tài khoản, phân quyền và audit log." },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <RevealOnScroll key={item.title} delay={index * 100} className="rounded-3xl border border-white/80 bg-white/72 p-6 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-xl">
                  <Icon className="h-8 w-8 text-brand-700" />
                  <h3 className="mt-4 font-display text-xl font-extrabold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.text}</p>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 py-12 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="enterprise-card p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Quy trình sử dụng</p>
                <h2 className="section-heading mt-2">Từ đăng ký đến điểm danh trong 4 bước</h2>
              </div>
              <Link to="/login" className="btn-press inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800">
                Bắt đầu
              </Link>
            </div>
            <div className="mt-7 grid gap-4 md:grid-cols-4">
              {[
                ["01", "Sinh viên xem sự kiện"],
                ["02", "Gửi đăng ký tham gia"],
                ["03", "Organizer duyệt và phát vé"],
                ["04", "Quét QR để điểm danh"],
              ].map(([step, label], index) => (
                <RevealOnScroll key={step} delay={index * 80} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="font-display text-2xl font-extrabold text-brand-700">{step}</p>
                  <p className="mt-2 text-sm font-bold text-slate-700">{label}</p>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" id="events" className="border-t border-white/70 px-5 py-14 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Đang mở đăng ký</p>
              <h2 className="section-heading mt-1">Sự kiện nổi bật</h2>
            </div>
            <Link to="/login" className="text-sm font-extrabold text-brand-700">Xem tất cả</Link>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {featuredEvents.map((event, index) => (
              <RevealOnScroll key={event.id} delay={index * 100}>
                <EventCard event={event} onViewDetails={() => navigate("/login")} onRegister={() => navigate("/login")} />
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 pb-16 pt-4 md:px-8">
        <div className="mx-auto max-w-[1180px] rounded-[28px] bg-gradient-to-r from-brand-800 to-brand-600 p-7 text-center text-white shadow-2xl shadow-brand-900/18 md:p-10">
          <Ticket className="mx-auto h-10 w-10 text-white/90" />
          <h2 className="mt-4 font-display text-3xl font-extrabold">Sẵn sàng quản lý sự kiện CLB chuyên nghiệp hơn?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-white/78">Đăng nhập bằng tài khoản TVU để tiếp tục với đúng vai trò của bạn trong hệ thống.</p>
          <Link to="/login" className="btn-press mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-6 text-sm font-extrabold text-brand-800">
            Đăng nhập ngay
          </Link>
        </div>
      </RevealOnScroll>
    </div>
  );
}
