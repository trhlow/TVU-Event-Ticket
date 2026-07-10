import { Ticket } from '../types/ticket';

const INITIAL_TICKETS: Ticket[] = [
  {
    id: 'tkt_1',
    eventId: 'event_it_1',
    studentId: 'user_std_1',
    ticketCode: 'TVU-IT1-93A8B',
    status: 'VALID',
    checkInStatus: 'PENDING',
    issuedAt: '2026-06-28T09:00:00Z',
  },
  {
    id: 'tkt_2',
    eventId: 'event_music_1',
    studentId: 'user_std_1',
    ticketCode: 'TVU-MSC1-884FB',
    status: 'VALID',
    checkInStatus: 'CHECKED_IN',
    checkInAt: '2026-07-02T19:15:00Z',
    issuedAt: '2026-07-01T15:00:00Z',
  },
  {
    id: 'tkt_3',
    eventId: 'event_music_1',
    studentId: 'user_std_2',
    ticketCode: 'TVU-MSC1-125FF',
    status: 'VALID',
    checkInStatus: 'PENDING',
    issuedAt: '2026-07-02T11:15:00Z',
  },
  {
    id: 'tkt_4',
    eventId: 'event_it_1',
    studentId: 'user_std_5',
    ticketCode: 'TVU-IT1-77AC1',
    status: 'VALID',
    checkInStatus: 'PENDING',
    issuedAt: '2026-06-29T10:00:00Z',
  },
  {
    id: 'tkt_5',
    eventId: 'event_english_2',
    studentId: 'user_std_1',
    ticketCode: 'TVU-ENG2-004AB',
    status: 'VALID',
    checkInStatus: 'CHECKED_IN',
    checkInAt: '2026-06-20T08:05:00Z',
    issuedAt: '2026-06-12T10:00:00Z',
  },
  {
    id: 'tkt_6',
    eventId: 'event_english_2',
    studentId: 'user_std_3',
    ticketCode: 'TVU-ENG2-991DA',
    status: 'CANCELLED',
    checkInStatus: 'PENDING',
    issuedAt: '2026-06-12T09:30:00Z',
  }
];

const STORAGE_KEY = 'tvu_event_ticket_tickets_v1';

export function getTickets(): Ticket[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return INITIAL_TICKETS;
}

export function saveTickets(tickets: Ticket[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

export const mockTickets: Ticket[] = getTickets();
