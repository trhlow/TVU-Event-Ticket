import { mockClubs } from "../data/mockClubs";
import { getEvents } from "../data/mockEvents";
import { getTickets } from "../data/mockTickets";
import { ClubStatsDetail, ClubStatsPage, ClubStatsQuery, ClubStatsSummary, DailyPoint } from "../types/clubStats";
import { apiConfig, apiRequest } from "./apiClient";

interface ClubStatsSummaryResponse {
  clubId: string;
  clubName: string;
  totalEvents: number;
  eventsByStatus: Record<string, number>;
  organizers: number;
  ticketsIssued: number;
  checkedIn: number;
  checkInRate: number | null;
}

interface ClubStatsPageResponse {
  content: ClubStatsSummaryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

interface ClubStatsDetailResponse {
  summary: ClubStatsSummaryResponse;
  last30Days: DailyPoint[];
}

function mapSummary(response: ClubStatsSummaryResponse): ClubStatsSummary {
  return {
    clubId: response.clubId,
    clubName: response.clubName,
    totalEvents: response.totalEvents,
    eventsByStatus: response.eventsByStatus,
    organizers: response.organizers,
    ticketsIssued: response.ticketsIssued,
    checkedIn: response.checkedIn,
    checkInRate: response.checkInRate,
  };
}

function buildMockSummary(clubId: string): ClubStatsSummary {
  const club = mockClubs.find((item) => item.id === clubId) || mockClubs[0];
  const events = getEvents().filter((event) => event.clubId === club.id);
  const tickets = getTickets().filter((ticket) => events.some((event) => event.id === ticket.eventId));
  const ticketsIssued = tickets.length;
  const checkedIn = tickets.filter((ticket) => ticket.checkInStatus === "CHECKED_IN").length;
  const eventsByStatus = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.status] = (acc[event.status] || 0) + 1;
    return acc;
  }, {});

  return {
    clubId: club.id,
    clubName: club.name,
    totalEvents: events.length,
    eventsByStatus,
    organizers: 0,
    ticketsIssued,
    checkedIn,
    checkInRate: ticketsIssued > 0 ? checkedIn / ticketsIssued : null,
  };
}

function buildMockLast30Days(clubId: string): DailyPoint[] {
  const club = mockClubs.find((item) => item.id === clubId) || mockClubs[0];
  const events = getEvents().filter((event) => event.clubId === club.id);
  const tickets = getTickets().filter((ticket) => events.some((event) => event.id === ticket.eventId));

  const days: DailyPoint[] = [];
  const today = new Date();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    const dateKey = day.toISOString().slice(0, 10);
    const ticketsIssued = tickets.filter((ticket) => ticket.issuedAt?.slice(0, 10) === dateKey).length;
    const checkedIn = tickets.filter((ticket) => ticket.checkInAt?.slice(0, 10) === dateKey).length;
    days.push({ date: dateKey, ticketsIssued, checkedIn });
  }
  return days;
}

async function withClubStatsFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  // Demo mode is the only sanctioned source of mock data; a failed real request always throws
  // so the UI shows a genuine error state instead of silently masking it with fixture data.
  if (apiConfig.useDemoData) return fallback();
  return request();
}

export const clubStatsService = {
  async listSummaries(query: ClubStatsQuery = {}): Promise<ClubStatsPage> {
    return withClubStatsFallback(
      async () => {
        const { page = 0, size = 20, sort } = query;
        const params = new URLSearchParams({ page: String(page), size: String(size) });
        if (sort) params.set("sort", sort);
        const response = await apiRequest<ClubStatsPageResponse>(`/admin/clubs/stats?${params.toString()}`);
        return {
          items: response.content.map(mapSummary),
          page: response.page,
          size: response.size,
          totalElements: response.totalElements,
          totalPages: response.totalPages,
        };
      },
      () => {
        const items = mockClubs.map((club) => buildMockSummary(club.id));
        return {
          items,
          page: 0,
          size: items.length,
          totalElements: items.length,
          totalPages: 1,
        };
      },
    );
  },
  async getDetail(clubId: string): Promise<ClubStatsDetail> {
    return withClubStatsFallback(
      async () => {
        const response = await apiRequest<ClubStatsDetailResponse>(`/admin/clubs/${clubId}/stats`);
        return { summary: mapSummary(response.summary), last30Days: response.last30Days };
      },
      () => ({ summary: buildMockSummary(clubId), last30Days: buildMockLast30Days(clubId) }),
    );
  },
};
