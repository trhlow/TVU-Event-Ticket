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
  async listAttendees(eventId: string): Promise<Ticket[]> {
    return withTicketFallback(
      async () => (await apiRequest<AttendeeResponse[]>(`/ticketing/events/${eventId}/attendees`)).map(mapAttendeeTicket),
      () => getTickets().filter((ticket) => ticket.eventId === eventId),
    );
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
