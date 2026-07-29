import { ClubStatsDetail, ClubStatsPage, ClubStatsQuery, ClubStatsSummary, DailyPoint } from "../types/clubStats";
import { apiRequest } from "./apiClient";

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

export const clubStatsService = {
  async listSummaries(query: ClubStatsQuery = {}): Promise<ClubStatsPage> {
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
  async getDetail(clubId: string): Promise<ClubStatsDetail> {
    const response = await apiRequest<ClubStatsDetailResponse>(`/admin/clubs/${clubId}/stats`);
    return { summary: mapSummary(response.summary), last30Days: response.last30Days };
  },
};
