import React, { useEffect, useState } from "react";
import { Info, Ticket as TicketIcon } from "lucide-react";
import TicketCard from "../../components/tickets/TicketCard";
import QRDisplayCard from "../../components/tickets/QRDisplayCard";
import DetailDrawer from "../../components/common/DetailDrawer";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import { useToast } from "../../hooks/useToast";
import { useTicketQr } from "../../hooks/useTicketQr";
import { ticketService } from "../../services/ticketService";
import { eventService } from "../../services/eventService";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";

// The event lookup below only reaches OPEN events (public discovery endpoint), so a ticket for an
// event that has since closed falls back here. The reservation that produced the ticket already
// carried the real title/location/time regardless of the event's current status — use that instead
// of a placeholder whenever it's available.
function fallbackEvent(ticket: Ticket): Event {
  return {
    id: ticket.eventId,
    clubId: "",
    clubName: "",
    title: ticket.eventTitle || "Sự kiện đang cập nhật thông tin",
    description: "",
    bannerUrl: "",
    location: ticket.eventLocation || "Đang cập nhật địa điểm",
    startAt: ticket.eventStartAt || ticket.issuedAt,
    endAt: ticket.eventStartAt || ticket.issuedAt,
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadFailed(false);
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
        if (mounted) {
          setLoadFailed(true);
          showToast(error instanceof Error ? error.message : "Không thể tải ví vé.", "error");
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const eventFor = (ticket: Ticket) => eventsById[ticket.eventId] || fallbackEvent(ticket);
  const activeTicket = tickets.find((ticket) => ticket.id === selectedTicketId);
  const activeEvent = activeTicket ? eventFor(activeTicket) : null;
  // Only the ticket the student actually opened. Fetching a payload for every ticket in the wallet
  // would hand out codes nobody asked to see, and each one is a credential.
  const qr = useTicketQr(selectedTicketId);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Ví vé điện tử cá nhân"
        description="Vé xuất hiện sau khi Ban tổ chức duyệt đăng ký và hệ thống cấp mã vé."
      />

      {isLoading ? (
        <LoadingSkeleton type="card" count={2} />
      ) : loadFailed ? (
        <EmptyState icon={TicketIcon} title="Không thể tải ví vé" description="Đã xảy ra lỗi khi tải danh sách vé. Vui lòng tải lại trang." />
      ) : tickets.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} event={eventFor(ticket)} onViewQR={setSelectedTicketId} />
          ))}
        </div>
      ) : (
        <EmptyState icon={TicketIcon} title="Ví vé của bạn đang trống" description="Chưa có đăng ký được duyệt kèm mã vé." />
      )}

      <div className="flex gap-3 rounded-card border border-info-100 bg-info-50/60 p-4 text-left">
        <Info className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        <p className="text-[10px] font-semibold leading-relaxed text-brand-800">
          Mã QR được gửi qua email ngay khi Ban tổ chức duyệt đăng ký. Nếu email thất lạc, mở vé tại
          đây để xem lại mã — mã hiển thị giống hệt mã trong email.
        </p>
      </div>

      {activeTicket && activeEvent && (
        <DetailDrawer isOpen={!!selectedTicketId} onClose={() => setSelectedTicketId(null)} title="Thông tin vé">
          <div className="p-1">
            <QRDisplayCard
              ticket={{ ...activeTicket, qrCodeValue: qr.value ?? undefined }}
              event={activeEvent}
              isQrLoading={qr.isLoading}
              qrExpiresAt={qr.expiresAt}
              onDownload={() => showToast("Dùng chức năng In vé để lưu lại mã QR.", "info")}
              onPrint={() => window.print()}
            />
          </div>
        </DetailDrawer>
      )}
    </div>
  );
}
