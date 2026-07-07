import { getTickets, saveTickets } from '../data/mockTickets';
import { Ticket } from '../types/ticket';
import { apiConfig, apiRequest } from './apiClient';

async function withTicketFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!apiConfig.enableMockFallback) throw error;
    return fallback();
  }
}

export const ticketService = {
  list(): Ticket[] {
    return getTickets();
  },
  async listRemote(): Promise<Ticket[]> {
    return withTicketFallback(() => apiRequest<Ticket[]>('/tickets'), () => getTickets());
  },
  listByStudent(studentId: string): Ticket[] {
    return getTickets().filter((ticket) => ticket.studentId === studentId);
  },
  async listByStudentRemote(studentId: string): Promise<Ticket[]> {
    return withTicketFallback(
      () => apiRequest<Ticket[]>(`/tickets?studentId=${encodeURIComponent(studentId)}`),
      () => getTickets().filter((ticket) => ticket.studentId === studentId),
    );
  },
  listByEvents(eventIds: string[]): Ticket[] {
    return getTickets().filter((ticket) => eventIds.includes(ticket.eventId));
  },
  async checkIn(ticketCode: string, eventId?: string): Promise<Ticket> {
    return withTicketFallback(
      () =>
        apiRequest<Ticket>('/tickets/check-in', {
          method: 'POST',
          body: JSON.stringify({ ticketCode, eventId }),
        }),
      () => {
        const tickets = getTickets();
        const index = tickets.findIndex((ticket) => ticket.ticketCode === ticketCode && (!eventId || ticket.eventId === eventId));
        if (index === -1) throw new Error('Ticket not found');
        const checkedInAt = new Date().toISOString();
        const updated: Ticket = { ...tickets[index], checkInStatus: 'CHECKED_IN', checkedInAt, checkInAt: checkedInAt };
        tickets[index] = updated;
        saveTickets(tickets);
        return updated;
      },
    );
  },
  save(tickets: Ticket[]): void {
    saveTickets(tickets);
  },
};
