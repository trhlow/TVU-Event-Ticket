import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Calendar, ChevronLeft, Mail, MapPin, UserRound } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";

function fallbackEvent(ticket: Ticket): Event {
  return {
    id: ticket.eventId,
    clubId: "",
    clubName: "CLB phu trach",
    title: ticket.eventId,
    description: "",
    category: "Su kien",
    bannerUrl: "",
    location: "Dia diem su kien",
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
  const currentUser = getCurrentUser();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [toastMsg, setToastMsg] = useState("");
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
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai thong tin ve.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadTicket();
    return () => {
      mounted = false;
    };
  }, [ticketId]);

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: "Sinh vien", path: "/student" }, { label: "Ve cua toi", path: "/student/tickets" }, { label: "Chi tiet ve" }]} />
        <div className="enterprise-card mx-auto max-w-md p-8 text-center text-sm font-bold text-slate-500">Dang tai thong tin ve...</div>
      </div>
    );
  }

  if (!ticket || !event) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[{ label: "Sinh vien", path: "/student" }, { label: "Ve cua toi", path: "/student/tickets" }, { label: "Chi tiet ve" }]} />
        <div className="enterprise-card mx-auto max-w-md p-8 text-center">
          <p className="text-sm font-bold text-slate-900">Ve khong ton tai hoac chua thuoc tai khoan hien tai.</p>
          <Link to="/student/tickets" className="mt-3 inline-block text-sm font-extrabold text-brand-700">
            Quay lai ve cua toi
          </Link>
        </div>
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb
        items={[
          { label: "Sinh vien", path: "/student" },
          { label: "Ve cua toi", path: "/student/tickets" },
          { label: ticket.ticketCode },
        ]}
      />

      <div className="flex items-center gap-3">
        <Link to="/student/tickets" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="tvu-page-title text-xl">Chi tiet ve QR dien tu</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Ve chi co QR khi backend da cap signed QR payload hop le.</p>
        </div>
      </div>

      <div className="grid max-w-5xl gap-8 lg:grid-cols-[390px_1fr]">
        <QRDisplayCard
          ticket={ticket}
          event={event}
          onDownload={() => setToastMsg("Backend chua cung cap file ve QR cho sinh vien.")}
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
              [UserRound, "Ho ten sinh vien", currentUser.fullName],
              [UserRound, "MSSV", currentUser.mssv || "Chua cap nhat"],
              [Mail, "Email", currentUser.email],
              [Calendar, "Thoi gian", formatDateTime(event.startAt)],
              [MapPin, "Dia diem", event.location],
              [Calendar, "Ngay cap ve", formatDateTime(ticket.issuedAt)],
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
              Quay lai dang ky cua toi
            </Link>
            <Link to="/student/tickets" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-extrabold text-white hover:bg-brand-700">
              Xem tat ca ve
            </Link>
          </div>
        </section>
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
