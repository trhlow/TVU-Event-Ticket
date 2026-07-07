import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardCheck, LogIn, QrCode, ScanLine, ShieldCheck, Ticket, UserCheck, Users } from "lucide-react";
import RevealOnScroll from "../../components/common/RevealOnScroll";

const roleGuides = [
  {
    title: "Sinh viên",
    icon: UserCheck,
    color: "text-brand-700 bg-brand-50 border-brand-100",
    steps: [
      "Đăng nhập bằng tài khoản @tvu.edu.vn.",
      "Xem danh sách sự kiện đang mở.",
      "Chọn sự kiện và gửi đăng ký.",
      "Chờ Ban tổ chức duyệt.",
      "Nhận vé QR sau khi được duyệt.",
      "Xuất trình QR để điểm danh tại sự kiện.",
    ],
  },
  {
    title: "Ban tổ chức CLB",
    icon: ClipboardCheck,
    color: "text-emerald-700 bg-emerald-50 border-emerald-100",
    steps: [
      "Đăng nhập tài khoản Organizer.",
      "Tạo sự kiện mới.",
      "Công bố sự kiện.",
      "Chia sẻ QR đăng ký sự kiện.",
      "Duyệt hoặc từ chối đăng ký.",
      "Quét QR vé điện tử để điểm danh.",
    ],
  },
  {
    title: "Quản trị viên hệ thống",
    icon: ShieldCheck,
    color: "text-violet-700 bg-violet-50 border-violet-100",
    steps: [
      "Quản lý CLB.",
      "Quản lý tài khoản Ban tổ chức.",
      "Theo dõi sự kiện toàn trường.",
      "Xem thống kê và audit log.",
    ],
  },
];

const qrGuides = [
  {
    title: "QR đăng ký sự kiện",
    icon: QrCode,
    text: "Dành cho Organizer chia sẻ để sinh viên mở trang đăng ký. Đây không phải là vé tham gia sự kiện.",
  },
  {
    title: "QR vé điện tử",
    icon: Ticket,
    text: "Dành cho Sinh viên sau khi đăng ký được duyệt. Đây là vé cá nhân dùng để check-in, không chia sẻ cho người khác.",
  },
  {
    title: "Quét QR điểm danh",
    icon: ScanLine,
    text: "Dành cho Organizer dùng camera hoặc nhập mã thủ công để check-in. Mỗi vé chỉ được điểm danh một lần.",
  },
];

const faqs = [
  {
    question: "Tôi cần tài khoản gì để đăng nhập?",
    answer: "Sinh viên dùng tài khoản Microsoft 365 thuộc miền @tvu.edu.vn. Ban tổ chức và quản trị viên dùng tài khoản nội bộ được cấp quyền phù hợp.",
  },
  {
    question: "Vì sao tôi đăng ký rồi nhưng chưa có vé QR?",
    answer: "Vé QR chỉ được phát hành sau khi Ban tổ chức duyệt đăng ký. Trong thời gian chờ, trạng thái của bạn sẽ là Chờ duyệt.",
  },
  {
    question: "QR đăng ký khác QR vé điện tử như thế nào?",
    answer: "QR đăng ký chỉ mở trang đăng ký sự kiện. QR vé điện tử là vé cá nhân được cấp sau khi duyệt và dùng để điểm danh.",
  },
  {
    question: "Nếu vé QR đã điểm danh rồi thì có dùng lại được không?",
    answer: "Không. Mỗi vé QR chỉ được check-in một lần để đảm bảo tính công bằng và chống dùng trùng vé.",
  },
  {
    question: "Ban tổ chức có thể duyệt khi hết vé không?",
    answer: "Không. Khi sự kiện hết vé, thao tác duyệt sẽ bị khóa hoặc hệ thống sẽ từ chối phát hành thêm vé.",
  },
  {
    question: "Tôi bị từ chối đăng ký thì xem lý do ở đâu?",
    answer: "Sinh viên có thể xem lý do tại trang Đăng ký của tôi trong khu vực tài khoản sinh viên.",
  },
];

export default function GuidePage() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="subtle-gradient-bg text-left">
      <section className="px-5 py-14 md:px-8 md:py-20">
        <div className="mx-auto max-w-[1180px]">
          <div className="page-hero p-6 text-white md:p-8">
            <p className="animate-slide-right inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <LogIn className="h-4 w-4" /> Hướng dẫn sử dụng
            </p>
            <h1 className="animate-slide-up mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
              Hướng dẫn sử dụng hệ thống
            </h1>
            <p className="animate-slide-up mt-3 max-w-3xl text-base font-medium leading-7 text-white/82" style={{ animationDelay: "120ms" }}>
              Tìm hiểu cách đăng ký sự kiện, nhận vé QR và điểm danh nhanh chóng trên TVU Event & Ticketing Platform.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-8 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-6 lg:grid-cols-3">
            {roleGuides.map((guide, index) => {
              const Icon = guide.icon;
              return (
                <RevealOnScroll key={guide.title} delay={index * 120} className="enterprise-card card-hover-lift p-6">
                  <div className={`inline-grid h-12 w-12 place-items-center rounded-2xl border ${guide.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="mt-5 font-display text-xl font-extrabold text-slate-950">{guide.title}</h2>
                  <ol className="mt-5 space-y-3">
                    {guide.steps.map((step, stepIndex) => (
                      <li key={step} className="flex gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-black text-white">
                          {stepIndex + 1}
                        </span>
                        <span className="pt-1 text-sm font-semibold leading-6 text-slate-600">{step}</span>
                      </li>
                    ))}
                  </ol>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      <RevealOnScroll as="section" className="px-5 py-10 md:px-8">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Phân biệt QR</p>
            <h2 className="section-heading mt-1">Ba loại QR trong hệ thống</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {qrGuides.map((item, index) => {
              const Icon = item.icon;
              return (
                <RevealOnScroll key={item.title} delay={index * 100} className="enterprise-card card-hover-lift p-6">
                  <Icon className="h-9 w-9 text-brand-700" />
                  <h3 className="mt-4 font-display text-lg font-extrabold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.text}</p>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 py-10 md:px-8">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-6 text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">FAQ</p>
            <h2 className="section-heading mt-1">Câu hỏi thường gặp</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.question} className="enterprise-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <span className="text-sm font-extrabold text-slate-950">{faq.question}</span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-brand-700 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <p className="border-t border-slate-100 px-5 pb-5 pt-4 text-sm font-medium leading-6 text-slate-600">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll as="section" className="px-5 pb-16 pt-8 md:px-8">
        <div className="mx-auto max-w-[1180px] rounded-[28px] bg-gradient-to-r from-brand-800 to-brand-600 p-7 text-center text-white shadow-2xl shadow-brand-900/18 md:p-10">
          <Users className="mx-auto h-10 w-10 text-white/90" />
          <h2 className="mt-4 font-display text-3xl font-extrabold">Bạn đã sẵn sàng tham gia sự kiện TVU?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-white/78">
            Xem sự kiện đang mở hoặc đăng nhập bằng Microsoft 365 để gửi đăng ký.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/events" className="btn-press inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/30 px-6 text-sm font-extrabold text-white hover:bg-white/10">
              Xem sự kiện
            </Link>
            <Link to="/login" className="btn-press inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-6 text-sm font-extrabold text-brand-800">
              Đăng nhập bằng Microsoft 365
            </Link>
          </div>
        </div>
      </RevealOnScroll>
    </div>
  );
}
