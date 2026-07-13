import React, { useEffect, useState } from "react";
import { Info, Ticket as TicketIcon } from "lucide-react";
import TicketCard from "../../components/tickets/TicketCard";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import DetailDrawer from "../../components/common/DetailDrawer";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import { ticketService } from "../../services/ticketService";
import { eventService } from "../../services/eventService";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";

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

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [eventsById, setEventsById] = useState<Record<string, Event>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    ticketService.listRemote()
      .then((items) => {
        if (mounted) setTickets(items);
        return Promise.all(items.map((ticket) => eventService.getByIdRemote(ticket.eventId).catch(() => undefined)));
      })
      .then((events) => {
        if (!mounted || !events) return;
        setEventsById(Object.fromEntries(events.filter((event): event is Event => Boolean(event)).map((event) => [event.id, event])));
      })
      .catch((error) => {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai vi ve.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const eventFor = (ticket: Ticket) => eventsById[ticket.eventId] || fallbackEvent(ticket);
  const activeTicket = tickets.find((ticket) => ticket.id === selectedTicketId);
  const activeEvent = activeTicket ? eventFor(activeTicket) : null;

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Sinh vien", path: "/student" }, { label: "Vi ve QR cua toi" }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black tracking-tight text-gray-950">Vi ve dien tu ca nhan</h2>
        <p className="text-xs font-semibold text-gray-500">Ve xuat hien sau khi organizer approve reservation va backend tra ticketId.</p>
      </div>

      {tickets.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} event={eventFor(ticket)} onViewQR={setSelectedTicketId} />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-gray-200 bg-white p-8 py-16 text-center shadow-sm">
          <TicketIcon className="mx-auto h-12 w-12 text-gray-300" />
          <h4 className="text-sm font-bold text-gray-950">Vi ve cua ban dang trong</h4>
          <p className="text-xs font-semibold leading-relaxed text-gray-500">Chua co reservation APPROVED kem ticketId.</p>
        </div>
      )}

      <div className="flex gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-left">
        <Info className="h-5 w-5 shrink-0 text-brand-600" />
        <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
          Backend hien chua co API tra QR payload cho sinh vien; khong tao QR signed gia o frontend.
        </p>
      </div>

      {activeTicket && activeEvent && (
        <DetailDrawer isOpen={!!selectedTicketId} onClose={() => setSelectedTicketId(null)} title="Thong tin ve">
          <div className="p-1">
            <QRDisplayCard ticket={activeTicket} event={activeEvent} onDownload={() => setToastMsg("Backend chua cung cap file ve QR.")} />
          </div>
        </DetailDrawer>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
