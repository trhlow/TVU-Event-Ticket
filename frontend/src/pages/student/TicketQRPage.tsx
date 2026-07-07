import React from "react";
import { Link, useParams } from "react-router-dom";
import { Calendar, ChevronLeft, Mail, MapPin, UserRound } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import { getCurrentUser } from "../../data/mockAuth";
import { mockEvents } from "../../data/mockEvents";
import { mockTickets } from "../../data/mockTickets";
import { formatDateTime } from "../../utils/formatDate";

export default function TicketQRPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const currentUser = getCurrentUser();
  const ticket = mockTickets.find((item) => item.id === ticketId);
  const event = ticket ? mockEvents.find((item) => item.id === ticket.eventId) : null;

  if (!ticket || !event) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: "Sinh viên", path: "/student" }, { label: "Vé của tôi", path: "/student/tickets" }, { label: "Chi tiết vé" }]} />
        <div className="enterprise-card mx-auto max-w-md p-8 text-center">
          <p className="text-sm font-bold text-slate-900">Vé không tồn tại hoặc đã bị hủy.</p>
          <Link to="/student/tickets" className="mt-3 inline-block text-sm font-extrabold text-brand-700">
            Quay lại vé của tôi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb
        items={[
          { label: "Sinh viên", path: "/student" },
          { label: "Vé của tôi", path: "/student/tickets" },
          { label: ticket.ticketCode },
        ]}
      />

      <div className="flex items-center gap-3">
        <Link to="/student/tickets" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="tvu-page-title text-xl">Chi tiết vé QR điện tử</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Xuất trình vé cá nhân này để Ban tổ chức điểm danh tại sự kiện.</p>
        </div>
      </div>

      <div className="grid max-w-5xl gap-8 lg:grid-cols-[390px_1fr]">
        <QRDisplayCard
          ticket={ticket}
          event={event}
          onDownload={() => window.alert("Đang chuẩn bị tải vé QR.")}
          onPrint={() => window.print()}
        />

        <section className="enterprise-card p-6">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">{event.category}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight text-slate-950">{event.title}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">{event.clubName}</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              [UserRound, "Họ tên sinh viên", currentUser.fullName],
              [UserRound, "MSSV", currentUser.mssv || "Chưa cập nhật"],
              [Mail, "Email", currentUser.email],
              [Calendar, "Thời gian", formatDateTime(event.startAt)],
              [MapPin, "Địa điểm", event.location],
              [Calendar, "Ngày cấp vé", formatDateTime(ticket.issuedAt)],
            ].map(([Icon, label, value]) => (
              <div key={label as string} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                {React.createElement(Icon as typeof UserRound, { className: "h-4 w-4 text-brand-700" })}
                <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{label as string}</p>
                <p className="mt-1 text-sm font-extrabold leading-6 text-slate-900">{value as string}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/student/registrations" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
              Quay lại đăng ký của tôi
            </Link>
            <Link to="/student/tickets" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700">
              Xem tất cả vé
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
