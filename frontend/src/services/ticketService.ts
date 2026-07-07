import { getTickets, saveTickets } from '../data/mockTickets';
import { Ticket } from '../types/ticket';

export const ticketService = {
  list(): Ticket[] {
    return getTickets();
  },
  listByStudent(studentId: string): Ticket[] {
    return getTickets().filter((ticket) => ticket.studentId === studentId);
  },
  listByEvents(eventIds: string[]): Ticket[] {
    return getTickets().filter((ticket) => eventIds.includes(ticket.eventId));
  },
  save(tickets: Ticket[]): void {
    saveTickets(tickets);
  },
};
