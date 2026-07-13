import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { eventService } from "../../services/eventService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";

interface EnhancedTicket extends Ticket {
  eventTitle: string;
}

export default function OrganizerTicketsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [tickets, setTickets] = useState<EnhancedTicket[]>([]);
  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState("ALL");
  const [filterCheckin, setFilterCheckin] = useState("ALL");
  const [toastMsg, setToastMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadTickets() {
      setIsLoading(true);
      try {
        const eventData = await eventService.listByClubRemote("");
        const attendeeGroups = await Promise.all(
          eventData.map((event) => ticketService.listAttendees(event.id).catch(() => [] as Ticket[])),
        );
        if (!mounted) return;

        setEvents(eventData);
        setTickets(attendeeGroups.flatMap((items, index) => {
          const event = eventData[index];
          return items.map((ticket) => ({ ...ticket, eventTitle: event?.title || ticket.eventId }));
        }));
      } catch (error) {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach ve.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadTickets();
    return () => {
      mounted = false;
    };
  }, []);

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
      header: "Ma ve / Ngay cap",
      accessor: (ticket: EnhancedTicket) => (
        <div className="text-left font-semibold">
          <span className="block font-mono font-bold tracking-wider text-gray-950">{ticket.ticketCode}</span>
          <span className="mt-0.5 block text-[10px] font-semibold text-gray-400">Cap: {formatDateTime(ticket.issuedAt)}</span>
        </div>
      ),
    },
    {
      header: "Sinh vien",
      accessor: (ticket: EnhancedTicket) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-gray-900">{ticket.studentId}</span>
          <span className="block text-[10px] font-mono text-gray-500">Student ID tu attendee API</span>
        </div>
      ),
    },
    {
      header: "Su kien",
      accessor: (ticket: EnhancedTicket) => (
        <span className="block max-w-xs truncate text-xs font-bold text-gray-700" title={ticket.eventTitle}>
          {ticket.eventTitle}
        </span>
      ),
    },
    {
      header: "Trang thai ve",
      accessor: (ticket: EnhancedTicket) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
          {ticket.checkedInAt && <span className="text-[9px] font-semibold text-gray-400">{formatDateTime(ticket.checkedInAt)}</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quan ly ve" }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black tracking-tight text-gray-950">Quan ly ve da phat hanh</h2>
        <p className="text-xs font-semibold text-gray-500">Doc attendee JSON tu ticketing service theo tung su kien cua club.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Tim kiem</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Su kien, student ID, ma ve..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-semibold focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Loc theo su kien</label>
          <select
            value={filterEvent}
            onChange={(event) => setFilterEvent(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs font-semibold focus:border-brand-500 focus:outline-hidden"
          >
            <option value="ALL">Tat ca su kien</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.title}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Loc check-in</label>
          <select
            value={filterCheckin}
            onChange={(event) => setFilterCheckin(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs font-semibold focus:border-brand-500 focus:outline-hidden"
          >
            <option value="ALL">Tat ca trang thai</option>
            <option value="PENDING">Chua check-in</option>
            <option value="CHECKED_IN">Da check-in</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-sm font-bold text-gray-500">Dang tai ve da phat hanh...</div>
        ) : (
          <DataTable data={filteredTickets} columns={columns} searchPlaceholder="Loc nhanh danh sach..." searchField="eventTitle" />
        )}
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
