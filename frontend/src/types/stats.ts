export interface DashboardStats {
  totalClubs: number;
  totalOrganizers: number;
  totalStudents: number;
  totalEvents: number;
  totalTicketsIssued: number;
  totalCheckedIn: number;
  registrationRate: number;
  checkInRate: number;
}

export interface ClubStats {
  clubId: string;
  clubName: string;
  eventsCount: number;
  ticketsIssuedCount: number;
  checkedInCount: number;
}
