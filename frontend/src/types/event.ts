export interface Event {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string;
  bannerUrl: string;
  location: string;
  startAt: string;
  endAt: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  capacity: number;
  remainingTickets: number;
  /** True when the ticket-availability lookup failed and remainingTickets is a fallback, not real data. */
  availabilityUnknown?: boolean;
  status: 'DRAFT' | 'OPEN' | 'UPCOMING' | 'CLOSED' | 'FULL' | 'ENDED';
}
