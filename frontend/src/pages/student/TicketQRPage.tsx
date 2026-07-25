import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Calendar, Mail, MapPin, UserRound } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import { useToast } from "../../components/common/ToastProvider";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";

function fallbackEvent(ticket: Ticket): Event {
  return {
    id: ticket.eventId,
    clubId: "",
    clubName: "Chưa có thông tin CLB",
    title: "Sự kiện đang cập nhật thông tin",
    description: "",
    category: "Sự kiện",
    bannerUrl: "",
    location: "Đang cập nhật địa điểm",
    startAt: ticket.issuedAt,
    endAt: ticket.issuedAt,
    registrationOpenAt: ticket.issuedAt,
    registrationCloseAt: ticket.issuedAt,
    capacity: 0,
    remainingTickets: 0,
    status: "OPEN",
  };
}

export default function TicketQRPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadTicket() {
      if (!ticketId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const tickets = await ticketService.listRemote();
        const currentTicket = tickets.find((item) => item.id === ticketId) || null;
        if (!mounted) return;
        setTicket(currentTicket);

        if (currentTicket) {
          const currentEvent = await eventService.getByIdRemote(currentTicket.eventId).catch(() => undefined);
          if (mounted) setEvent(currentEvent || fallbackEvent(currentTicket));
        }
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải thông tin vé.", "error");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadTicket();
    return () => {
      mounted = false;
    };
  }, [ticketId, showToast]);

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <PageHeader title="Chi tiết vé QR điện tử" />
        <LoadingSkeleton type="list" count={3} />
      </div>
    );
  }

  if (!ticket || !event) {
    return (
      <div className="space-y-6 text-left">
        <PageHeader title="Chi tiết vé QR điện tử" />
        <div className="enterprise-card mx-auto max-w-md p-8 text-center">
          <p className="text-sm font-bold text-slate-900">Vé không tồn tại hoặc chưa thuộc tài khoản hiện tại.</p>
          <Link to="/student/tickets" className="mt-3 inline-block text-sm font-extrabold text-brand-700">
            Quay lại vé của tôi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Chi tiết vé QR điện tử"
        description="Vé chỉ có QR khi backend đã cấp signed QR payload hợp lệ."
      />

      <div className="grid max-w-5xl gap-8 lg:grid-cols-[390px_1fr]">
        <QRDisplayCard
          ticket={ticket}
          event={event}
          onDownload={() => showToast("Backend chưa cung cấp file vé QR cho sinh viên.", "info")}
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
            <Link to="/student/registrations" className="btn-press inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">
              Quay lại đăng ký của tôi
            </Link>
            <Link to="/student/tickets" className="btn-press inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700">
              Xem tất cả vé
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
