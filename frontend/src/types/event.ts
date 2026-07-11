export interface Event {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string;
  category: string;
  bannerUrl: string;
  location: string;
  startAt: string;
  endAt: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  capacity: number;
  remainingTickets: number;
  status: 'DRAFT' | 'OPEN' | 'UPCOMING' | 'CLOSED' | 'FULL' | 'ENDED';
}
