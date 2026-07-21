import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/common/ToastProvider";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";

interface EnhancedTicket extends Ticket {
  eventTitle: string;
}

export default function OrganizerTicketsPage() {
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [tickets, setTickets] = useState<EnhancedTicket[]>([]);
  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState("ALL");
  const [filterCheckin, setFilterCheckin] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadTickets() {
      setIsLoading(true);
      try {
        const eventData = await eventService.listByClubRemote(currentUser.clubId || "");
        const attendeeGroups = await Promise.all(
          eventData.map((event) => ticketService.listAttendees(event.id).catch(() => ({ tickets: [] as Ticket[], totalElements: 0 }))),
        );
        if (!mounted) return;

        setEvents(eventData);
        setTickets(attendeeGroups.flatMap((group, index) => {
          const event = eventData[index];
          return group.tickets.map((ticket) => ({ ...ticket, eventTitle: event?.title || "Sự kiện đang cập nhật thông tin" }));
        }));
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải danh sách vé.", "error");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadTickets();
    return () => {
      mounted = false;
    };
  }, [currentUser.clubId, showToast]);

  const filteredTickets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchSearch = !normalized || `${ticket.eventTitle} ${ticket.ticketCode} ${ticket.studentId}`.toLowerCase().includes(normalized);
      const matchEvent = filterEvent === "ALL" || ticket.eventId === filterEvent;
      const matchCheckin = filterCheckin === "ALL" || ticket.checkInStatus === filterCheckin;
      return matchSearch && matchEvent && matchCheckin;
    });
  }, [filterCheckin, filterEvent, search, tickets]);

  const columns = [
    {
      header: "Mã vé / Ngày cấp",
      accessor: (ticket: EnhancedTicket) => (
        <div className="text-left font-semibold">
          <span className="block font-mono font-bold tracking-wider text-slate-950">{ticket.ticketCode}</span>
          <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">Cấp: {formatDateTime(ticket.issuedAt)}</span>
        </div>
      ),
    },
    {
      header: "Sinh viên",
      accessor: (ticket: EnhancedTicket) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-slate-900">{ticket.studentId}</span>
          <span className="block text-[10px] font-mono text-slate-500">Student ID từ attendee API</span>
        </div>
      ),
    },
    {
      header: "Sự kiện",
      accessor: (ticket: EnhancedTicket) => (
        <span className="block max-w-xs truncate text-xs font-bold text-slate-700" title={ticket.eventTitle}>
          {ticket.eventTitle}
        </span>
      ),
    },
    {
      header: "Trạng thái vé",
      accessor: (ticket: EnhancedTicket) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
          {ticket.checkedInAt && <span className="text-[9px] font-semibold text-slate-400">{formatDateTime(ticket.checkedInAt)}</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Quản lý vé đã phát hành"
        description="Đọc attendee JSON từ ticket-service theo từng sự kiện của CLB."
      />

      <div className="enterprise-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tìm kiếm</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Sự kiện, student ID, mã vé..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Lọc theo sự kiện</label>
          <select value={filterEvent} onChange={(event) => setFilterEvent(event.target.value)} className="tvu-input">
            <option value="ALL">Tất cả sự kiện</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Lọc check-in</label>
          <select value={filterCheckin} onChange={(event) => setFilterCheckin(event.target.value)} className="tvu-input">
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PENDING">Chưa check-in</option>
            <option value="CHECKED_IN">Đã check-in</option>
          </select>
        </div>
      </div>

      <div className="enterprise-card overflow-hidden p-1">
        {isLoading ? (
          <LoadingSkeleton type="table" count={5} />
        ) : (
          <DataTable data={filteredTickets} columns={columns} searchPlaceholder="Lọc nhanh danh sách..." searchField="eventTitle" />
        )}
      </div>
    </div>
  );
}
