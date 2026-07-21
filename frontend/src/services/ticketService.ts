import { getTickets, saveTickets } from "../data/mockTickets";
import { Ticket } from "../types/ticket";
import { apiConfig, apiRequest, createUnsupportedApiError } from "./apiClient";

interface ReservationResponse {
  id: string;
  eventId: string;
  studentId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  ticketId?: string | null;
}

interface TicketResponse {
  id: string;
  reservationId: string;
  eventId: string;
  studentId: string;
  status: "VALID" | "CHECKED_IN" | "CANCELLED";
  issuedAt: string;
  checkedInAt?: string | null;
}

interface AttendeeResponse {
  ticketId: string;
  eventId: string;
  studentId: string;
  studentEmail: string;
  studentMssv: string;
  status: string;
  issuedAt: string;
  checkedInAt?: string | null;
}

interface AttendeePageResponse {
  content: AttendeeResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AttendeePage {
  items: Ticket[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AttendeeQuery {
  status?: "VALID" | "CHECKED_IN" | "CANCELLED";
  keyword?: string;
  page?: number;
  size?: number;
  sort?: string;
}

interface AvailabilityResponse {
  eventId: string;
  totalCapacity: number;
  approvedCount: number;
  remaining: number;
}

function mapTicket(response: TicketResponse): Ticket {
  const checkedIn = response.status === "CHECKED_IN" || Boolean(response.checkedInAt);
  return {
    id: response.id,
    reservationId: response.reservationId,
    eventId: response.eventId,
    studentId: response.studentId,
    ticketCode: response.id,
    status: response.status === "CHECKED_IN" ? "VALID" : response.status,
    checkInStatus: checkedIn ? "CHECKED_IN" : "PENDING",
    issuedAt: response.issuedAt,
    checkedInAt: response.checkedInAt || undefined,
    checkInAt: response.checkedInAt || undefined,
  };
}

function mapReservationTicket(response: ReservationResponse): Ticket | null {
  if (response.status !== "APPROVED" || !response.ticketId) return null;
  return {
    id: response.ticketId,
    reservationId: response.id,
    eventId: response.eventId,
    studentId: response.studentId,
    ticketCode: response.ticketId,
    status: "VALID",
    checkInStatus: "PENDING",
    issuedAt: response.requestedAt,
  };
}

function mapAttendeeTicket(response: AttendeeResponse): Ticket {
  const checkedIn = response.status === "CHECKED_IN" || Boolean(response.checkedInAt);
  return {
    id: response.ticketId,
    eventId: response.eventId,
    studentId: response.studentId,
    ticketCode: response.ticketId,
    studentEmail: response.studentEmail,
    studentMssv: response.studentMssv,
    status: response.status === "CHECKED_IN" ? "VALID" : (response.status as Ticket["status"]),
    checkInStatus: checkedIn ? "CHECKED_IN" : "PENDING",
    issuedAt: response.issuedAt,
    checkedInAt: response.checkedInAt || undefined,
    checkInAt: response.checkedInAt || undefined,
  };
}

async function withTicketFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  // Demo mode is the only sanctioned source of mock data; a failed real request always throws
  // so the UI shows a genuine error state instead of silently masking it with fixture data.
  if (apiConfig.useDemoData) return fallback();
  return request();
}

export const ticketService = {
  list(): Ticket[] {
    return getTickets();
  },
  async listRemote(): Promise<Ticket[]> {
    return withTicketFallback(
      async () => {
        const reservations = await apiRequest<ReservationResponse[]>("/reservations/me");
        return reservations.map(mapReservationTicket).filter((ticket): ticket is Ticket => ticket !== null);
      },
      () => getTickets(),
    );
  },
  listByStudent(studentId: string): Ticket[] {
    return getTickets().filter((ticket) => ticket.studentId === studentId);
  },
  async listByStudentRemote(studentId: string): Promise<Ticket[]> {
    return withTicketFallback(
      async () => {
        void studentId;
        return this.listRemote();
      },
      () => getTickets().filter((ticket) => ticket.studentId === studentId),
    );
  },
  listByEvents(eventIds: string[]): Ticket[] {
    return getTickets().filter((ticket) => eventIds.includes(ticket.eventId));
  },
  async listAttendeesPage(eventId: string, query: AttendeeQuery = {}): Promise<AttendeePage> {
    return withTicketFallback(
      async () => {
        const { status, keyword, page = 0, size = 20, sort } = query;
        const params = new URLSearchParams({ page: String(page), size: String(size) });
        if (status) params.set("status", status);
        if (keyword) params.set("keyword", keyword);
        if (sort) params.set("sort", sort);
        const response = await apiRequest<AttendeePageResponse | AttendeeResponse[]>(
          `/ticketing/events/${eventId}/attendees?${params.toString()}`,
        );
        // Older, still-deployed backends return a bare unpaginated array and ignore
        // status/keyword/page/size entirely; apply the filtering/pagination client-side so the
        // UI still behaves once the backend catches up and starts doing it server-side.
        if (Array.isArray(response)) {
          const filtered = response.filter((attendee) => {
            const matchesStatus = !status || attendee.status === status;
            const normalizedKeyword = keyword?.trim().toLowerCase();
            const matchesKeyword = !normalizedKeyword
              || attendee.studentEmail?.toLowerCase().includes(normalizedKeyword)
              || attendee.studentMssv?.toLowerCase().includes(normalizedKeyword);
            return matchesStatus && matchesKeyword;
          });
          return {
            items: filtered.slice(page * size, page * size + size).map(mapAttendeeTicket),
            page,
            size,
            totalElements: filtered.length,
            totalPages: Math.max(1, Math.ceil(filtered.length / size)),
          };
        }
        return {
          items: response.content.map(mapAttendeeTicket),
          page: response.page,
          size: response.size,
          totalElements: response.totalElements,
          totalPages: response.totalPages,
        };
      },
      () => {
        const all = getTickets().filter((ticket) => ticket.eventId === eventId);
        const size = query.size ?? 20;
        const page = query.page ?? 0;
        return {
          items: all.slice(page * size, page * size + size),
          page,
          size,
          totalElements: all.length,
          totalPages: Math.max(1, Math.ceil(all.length / size)),
        };
      },
    );
  },
  // Fetches every page of attendees for callers that need the full list (dashboards, CSV-adjacent
  // views). Real attendee lists are club-sized, not school-sized, so this stays bounded.
  async listAttendees(eventId: string): Promise<Ticket[]> {
    const size = 200;
    const first = await this.listAttendeesPage(eventId, { page: 0, size });
    const pages = [first.items];
    for (let page = 1; page < first.totalPages; page += 1) {
      const next = await this.listAttendeesPage(eventId, { page, size });
      pages.push(next.items);
    }
    return pages.flat();
  },
  async availability(eventId: string): Promise<AvailabilityResponse> {
    return apiRequest<AvailabilityResponse>(`/ticketing/events/${eventId}/availability`);
  },
  async initializeInventory(eventId: string): Promise<void> {
    await withTicketFallback(
      () => apiRequest<unknown>("/tickets/inventories", {
        method: "POST",
        body: JSON.stringify({ eventId }),
      }),
      () => undefined,
    );
  },
  async checkIn(qrPayload: string): Promise<Ticket> {
    return withTicketFallback(
      async () => mapTicket(await apiRequest<TicketResponse>("/ticketing/check-in", {
        method: "POST",
        body: JSON.stringify({ qrPayload }),
      })),
      () => {
        const tickets = getTickets();
        const index = tickets.findIndex((ticket) => ticket.ticketCode === qrPayload || ticket.qrCodeValue === qrPayload);
        if (index === -1) throw new Error("Ticket not found");
        if (tickets[index].status !== "VALID") throw new Error("Ticket is not valid");
        if (tickets[index].checkInStatus === "CHECKED_IN") throw new Error("Ticket already checked in");
        const checkedInAt = new Date().toISOString();
        const updated: Ticket = { ...tickets[index], checkInStatus: "CHECKED_IN", checkedInAt, checkInAt: checkedInAt };
        tickets[index] = updated;
        saveTickets(tickets);
        return updated;
      },
    );
  },
  getQrPayload(): never {
    throw createUnsupportedApiError("QR ticket payload cho sinh vien");
  },
  save(tickets: Ticket[]): void {
    saveTickets(tickets);
  },
};
