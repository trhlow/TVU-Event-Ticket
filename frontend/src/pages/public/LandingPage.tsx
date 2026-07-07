import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bolt, QrCode } from "lucide-react";
import EventCard from "../../components/events/EventCard";
import { mockEvents } from "../../data/mockEvents";

export default function LandingPage() {
  const navigate = useNavigate();
  const featuredEvents = mockEvents.slice(0, 3);

  return (
    <div className="bg-[#FBF8FF] text-left">
      <section className="relative overflow-hidden border-b border-[#E3E1EB] px-8 py-24 md:py-32">
        <div className="absolute right-0 top-0 h-full w-[58%] skew-x-[-12deg] bg-[#EEF2FF]" />
        <div className="relative mx-auto grid max-w-[1152px] items-center gap-14 lg:grid-cols-[1fr_560px]">
          <div>
            <h1 className="font-display text-5xl font-extrabold leading-tight text-brand-600 md:text-[56px]">
              Hệ thống quản lý vé sự kiện chuyên nghiệp
            </h1>
            <p className="mt-7 max-w-[560px] text-lg font-medium leading-8 text-[#444653]">
              Trải nghiệm đăng ký, check-in và quản lý sự kiện liền mạch, minh bạch dành cho sinh viên và câu lạc bộ TVU.
            </p>
            <div className="mt-7 flex gap-4">
              <Link to="/student/events" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-bold text-white hover:bg-brand-700">
                Xem sự kiện
              </Link>
              <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-brand-600 px-6 text-sm font-bold text-brand-600 hover:bg-brand-50">
                Đăng nhập
              </Link>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-2xl shadow-slate-900/10">
            <div className="rounded-lg border border-[#E3E1EB] bg-[#FBF8FF] p-5">
              <div className="flex items-center gap-2">
                <img src="/src/assets/images/tvu_logo_1783065060265.jpg" alt="TVU" className="h-8 w-8 rounded bg-white object-contain" />
                <div>
                  <p className="text-sm font-extrabold text-brand-700">TVU</p>
                  <p className="text-xs font-semibold text-[#444653]">Trang chủ - TVU Event Ticket</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-[170px_1fr] gap-5">
                <div className="space-y-3">
                  <div className="h-7 rounded bg-white" />
                  <div className="h-7 rounded bg-white" />
                  <div className="h-7 rounded bg-white" />
                  <div className="mt-5 h-24 rounded-lg bg-brand-100" />
                  <div className="h-24 rounded-lg bg-brand-50" />
                </div>
                <div className="relative min-h-[230px] rounded-xl bg-gradient-to-br from-white to-brand-50 p-6">
                  <div className="absolute left-8 top-10 h-20 w-32 rotate-[-8deg] rounded-xl bg-brand-700 shadow-xl" />
                  <div className="absolute left-32 top-24 h-24 w-40 rotate-[10deg] rounded-xl bg-brand-500 shadow-xl" />
                  <div className="absolute right-12 top-16 grid h-24 w-24 place-items-center rounded-2xl border border-brand-200 bg-white text-brand-700 shadow-lg">
                    <QrCode className="h-12 w-12" />
                  </div>
                  <div className="absolute bottom-8 right-10 rounded-full bg-brand-700 px-4 py-2 text-xs font-extrabold text-white">Đã xác nhận</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="px-8 py-14">
        <div className="mx-auto max-w-[1152px]">
          <div className="text-center">
            <h2 className="font-display text-3xl font-extrabold text-brand-600">Tại sao chọn TVU Ticket?</h2>
            <p className="mt-3 text-base font-medium text-[#444653]">Giải pháp toàn diện cho mọi nhu cầu tổ chức sự kiện</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="enterprise-card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-100 text-brand-600">
                <Bolt className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-extrabold text-[#1A1B22]">Đăng ký nhanh chóng</h3>
              <p className="mt-2 text-base font-medium leading-7 text-[#444653]">
                Giao diện tối giản giúp sinh viên tìm kiếm và đặt vé sự kiện chỉ trong vài cú click chuột, tiết kiệm thời gian tối đa.
              </p>
            </div>
            <div className="enterprise-card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-100 text-brand-600">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-extrabold text-[#1A1B22]">Vé QR Code</h3>
              <p className="mt-2 text-base font-medium leading-7 text-[#444653]">
                Mỗi vé phát hành đi kèm một mã QR duy nhất, đảm bảo tính bảo mật và dễ dàng truy xuất.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#E3E1EB] px-8 py-14">
        <div className="mx-auto max-w-[1152px]">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl font-extrabold text-[#1A1B22]">Sự kiện đang mở đăng ký</h2>
            <Link to="/login" className="text-sm font-extrabold text-brand-700">Xem tất cả</Link>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {featuredEvents.map((event) => (
              <EventCard key={event.id} event={event} onViewDetails={() => navigate("/login")} onRegister={() => navigate("/login")} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
