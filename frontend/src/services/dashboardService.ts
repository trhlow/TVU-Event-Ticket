import { apiRequest } from "./apiClient";

export interface ClubDashboard {
  clubId: string;
  pending: number;
  approved: number;
  checkedIn: number;
  checkInRate: number | null;
  registrationsByDay: Array<{ date: string; count: number }>;
}

export interface EventDashboard {
  eventId: string;
  clubId: string;
  totalCapacity: number;
  remaining: number;
  approved: number;
  checkedIn: number;
  checkInRate: number | null;
}

export const dashboardService = {
  async clubDashboard(): Promise<ClubDashboard> {
    return apiRequest<ClubDashboard>("/ticketing/dashboard/club");
  },
  async eventDashboard(eventId: string): Promise<EventDashboard> {
    return apiRequest<EventDashboard>(`/ticketing/events/${eventId}/dashboard`);
  },
};
