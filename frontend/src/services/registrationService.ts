import { getReservations, saveReservations } from '../data/mockReservations';
import { getTickets, saveTickets } from '../data/mockTickets';
import { Reservation } from '../types/reservation';
import { Ticket } from '../types/ticket';
import { apiConfig, apiRequest } from './apiClient';

async function withReservationFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!apiConfig.enableMockFallback) throw error;
    return fallback();
  }
}

export const registrationService = {
  list(): Reservation[] {
    return getReservations();
  },
  async listRemote(): Promise<Reservation[]> {
    return withReservationFallback(() => apiRequest<Reservation[]>('/reservations'), () => getReservations());
  },
  listByStudent(studentId: string): Reservation[] {
    return getReservations().filter((reservation) => reservation.studentId === studentId);
  },
  async listByStudentRemote(studentId: string): Promise<Reservation[]> {
    return withReservationFallback(
      () => apiRequest<Reservation[]>(`/reservations?studentId=${encodeURIComponent(studentId)}`),
      () => getReservations().filter((reservation) => reservation.studentId === studentId),
    );
  },
  listByEvents(eventIds: string[]): Reservation[] {
    return getReservations().filter((reservation) => eventIds.includes(reservation.eventId));
  },
  async submit(data: Reservation): Promise<Reservation> {
    return withReservationFallback(
      () =>
        apiRequest<Reservation>('/reservations', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      () => {
        const next = [data, ...getReservations()];
        saveReservations(next);
        return data;
      },
    );
  },
  async updateStatus(reservationId: string, status: Reservation['status'], rejectReason?: string): Promise<Reservation> {
    return withReservationFallback(
      () =>
        apiRequest<Reservation>(`/reservations/${reservationId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status, rejectReason }),
        }),
      () => {
        const reservations = getReservations();
        const index = reservations.findIndex((reservation) => reservation.id === reservationId);
        if (index === -1) throw new Error('Reservation not found');
        const updated = { ...reservations[index], status, rejectReason };
        reservations[index] = updated;
        saveReservations(reservations);
        if (status === 'APPROVED') {
          issueTicketForApprovedReservation(updated);
        }
        return updated;
      },
    );
  },
  save(reservations: Reservation[]): void {
    saveReservations(reservations);
  },
};

function issueTicketForApprovedReservation(reservation: Reservation): void {
  const tickets = getTickets();
  const existingTicket = tickets.find((ticket) => ticket.reservationId === reservation.id);
  if (existingTicket) return;

  const shortEventCode = reservation.eventId.replace(/^event_/, '').slice(0, 4).toUpperCase();
  const ticketCode = `TVU-${shortEventCode}-${reservation.id.slice(-4).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const ticket: Ticket = {
    id: `tkt_${reservation.id}`,
    reservationId: reservation.id,
    eventId: reservation.eventId,
    studentId: reservation.studentId,
    ticketCode,
    qrCodeValue: ticketCode,
    status: 'VALID',
    checkInStatus: 'PENDING',
    issuedAt: new Date().toISOString(),
  };

  saveTickets([ticket, ...tickets]);
}
