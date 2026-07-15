import React, { useEffect, useState } from "react";
import { Info, Ticket as TicketIcon } from "lucide-react";
import TicketCard from "../../components/tickets/TicketCard";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import DetailDrawer from "../../components/common/DetailDrawer";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import Toast from "../../components/common/Toast";
import { ticketService } from "../../services/ticketService";
import { eventService } from "../../services/eventService";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";

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
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Không thể tải ví vé.");
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
      <PageHeader
        breadcrumb={[{ label: "Sinh viên", path: "/student" }, { label: "Ví vé QR của tôi" }]}
        title="Ví vé điện tử cá nhân"
        description="Vé xuất hiện sau khi Ban tổ chức duyệt đăng ký và backend cấp mã vé."
      />

      {tickets.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} event={eventFor(ticket)} onViewQR={setSelectedTicketId} />
          ))}
        </div>
      ) : (
        <EmptyState icon={TicketIcon} title="Ví vé của bạn đang trống" description="Chưa có đăng ký được duyệt kèm mã vé." />
      )}

      <div className="flex gap-3 rounded-xl border border-info-100 bg-info-50/60 p-4 text-left">
        <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
          Backend hiện chưa có API trả QR payload trực tiếp cho sinh viên; frontend không tự tạo QR ký giả.
        </p>
      </div>

      {activeTicket && activeEvent && (
        <DetailDrawer isOpen={!!selectedTicketId} onClose={() => setSelectedTicketId(null)} title="Thông tin vé">
          <div className="p-1">
            <QRDisplayCard ticket={activeTicket} event={activeEvent} onDownload={() => setToastMsg("Backend chưa cung cấp file vé QR.")} />
          </div>
        </DetailDrawer>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
