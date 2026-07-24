import { apiRequest } from "./apiClient";

export interface AdminStats {
  totalClubs: number;
  totalUsers: number;
  usersByRole: Partial<Record<"SINH_VIEN" | "ORGANIZER" | "SUPER_ADMIN", number>>;
}

export interface EventStats {
  totalEvents: number;
  eventsByStatus: Partial<Record<"DRAFT" | "OPEN" | "CLOSED", number>>;
}

export interface TicketStats {
  ticketsIssued: number;
  checkedIn: number;
  checkInRate: number | null;
}

export interface SchoolWideOverview {
  admin: AdminStats;
  events: EventStats;
  tickets: TicketStats;
}

export const statisticsService = {
  async adminStats(): Promise<AdminStats> {
    return apiRequest<AdminStats>("/admin/stats");
  },
  async eventStats(): Promise<EventStats> {
    return apiRequest<EventStats>("/events/stats");
  },
  async ticketStats(): Promise<TicketStats> {
    return apiRequest<TicketStats>("/ticketing/stats");
  },
  async overview(): Promise<SchoolWideOverview> {
    const [admin, events, tickets] = await Promise.all([
      this.adminStats(),
      this.eventStats(),
      this.ticketStats(),
    ]);
    return { admin, events, tickets };
  },
};
