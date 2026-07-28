import { Ticket } from "../types/ticket";
import { apiRequest } from "./apiClient";

interface ReservationResponse {
  id: string;
  eventId: string;
  studentId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  ticketId?: string | null;
  eventTitle?: string;
  eventLocation?: string;
  eventStartAt?: string;
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
    // /reservations/me carries no check-in data at all — this is not "not checked in yet", it is
    // genuinely unknown. See the Ticket.checkInStatus doc comment.
    checkInStatus: "UNKNOWN",
    issuedAt: response.requestedAt,
    eventTitle: response.eventTitle || undefined,
    eventLocation: response.eventLocation || undefined,
    eventStartAt: response.eventStartAt || undefined,
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

export const ticketService = {
  async listRemote(): Promise<Ticket[]> {
    const reservations = await apiRequest<ReservationResponse[]>("/reservations/me");
    return reservations.map(mapReservationTicket).filter((ticket): ticket is Ticket => ticket !== null);
  },
  async listByStudentRemote(studentId: string): Promise<Ticket[]> {
    void studentId;
    return this.listRemote();
  },
  async listAttendeesPage(eventId: string, query: AttendeeQuery = {}): Promise<AttendeePage> {
    const { status, keyword, page = 0, size = 20, sort } = query;
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (status) params.set("status", status);
    if (keyword) params.set("keyword", keyword);
    if (sort) params.set("sort", sort);
    const response = await apiRequest<AttendeePageResponse>(
      `/ticketing/events/${eventId}/attendees?${params.toString()}`,
    );
    return {
      items: response.content.map(mapAttendeeTicket),
      page: response.page,
      size: response.size,
      totalElements: response.totalElements,
      totalPages: response.totalPages,
    };
  },
  // Fetches every page of attendees for callers that need the full list (dashboards, CSV-adjacent
  // views). Real attendee lists are club-sized, not school-sized, so this stays bounded.
  async listAttendees(eventId: string): Promise<Ticket[]> {
    const size = 100;
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
  async exportAttendeesCsv(
    eventId: string,
    filters: Pick<AttendeeQuery, "status" | "keyword"> = {},
  ): Promise<string> {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.keyword) params.set("keyword", filters.keyword);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return apiRequest<string>(`/ticketing/events/${eventId}/attendees.csv${suffix}`);
  },
  async checkIn(qrPayload: string): Promise<Ticket> {
    return mapTicket(await apiRequest<TicketResponse>("/ticketing/check-in", {
      method: "POST",
      body: JSON.stringify({ qrPayload }),
    }));
  },
};
