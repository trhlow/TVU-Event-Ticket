import { DashboardStats, ClubStats } from '../types/stats';

export const mockDashboardStats: DashboardStats = {
  totalClubs: 4,
  totalOrganizers: 3,
  totalStudents: 10,
  totalEvents: 6,
  totalTicketsIssued: 6,
  totalCheckedIn: 2,
  registrationRate: 85.5,
  checkInRate: 33.3, // 2 checked in out of 6 issued
};

export const mockClubStats: ClubStats[] = [
  {
    clubId: 'club_it',
    clubName: 'CLB Tin học',
    eventsCount: 2,
    ticketsIssuedCount: 2,
    checkedInCount: 0,
  },
  {
    clubId: 'club_music',
    clubName: 'CLB Âm nhạc',
    eventsCount: 1,
    ticketsIssuedCount: 2,
    checkedInCount: 0,
  },
  {
    clubId: 'club_english',
    clubName: 'CLB Tiếng Anh',
    eventsCount: 2,
    ticketsIssuedCount: 2,
    checkedInCount: 2,
  },
  {
    clubId: 'club_volunteer',
    clubName: 'Đội Tình nguyện Xung kích',
    eventsCount: 1,
    ticketsIssuedCount: 0,
    checkedInCount: 0,
  }
];

export const monthlyRegistrationsData = [
  { name: 'Tháng 1', dangKy: 15, thamGia: 12 },
  { name: 'Tháng 2', dangKy: 22, thamGia: 18 },
  { name: 'Tháng 3', dangKy: 45, thamGia: 40 },
  { name: 'Tháng 4', dangKy: 35, thamGia: 30 },
  { name: 'Tháng 5', dangKy: 62, thamGia: 55 },
  { name: 'Tháng 6', dangKy: 80, thamGia: 72 },
  { name: 'Tháng 7', dangKy: 95, thamGia: 42 }
];

export const categoryDistributionData = [
  { name: 'Học thuật', value: 2 },
  { name: 'Văn nghệ', value: 1 },
  { name: 'Cuộc thi', value: 2 },
  { name: 'Tình nguyện', value: 1 }
];
