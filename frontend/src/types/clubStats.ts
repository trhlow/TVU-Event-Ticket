export type ClubEventStatus = "DRAFT" | "OPEN" | "CLOSED";

export interface ClubStatsSummary {
  clubId: string;
  clubName: string;
  totalEvents: number;
  eventsByStatus: Partial<Record<ClubEventStatus, number>>;
  organizers: number;
  ticketsIssued: number;
  checkedIn: number;
  checkInRate: number | null;
}

export interface DailyPoint {
  date: string;
  ticketsIssued: number;
  checkedIn: number;
}

export interface ClubStatsDetail {
  summary: ClubStatsSummary;
  last30Days: DailyPoint[];
}

export interface ClubStatsPage {
  items: ClubStatsSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ClubStatsQuery {
  page?: number;
  size?: number;
  sort?: string;
}
