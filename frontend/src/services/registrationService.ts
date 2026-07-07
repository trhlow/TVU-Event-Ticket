import { getReservations, saveReservations } from '../data/mockReservations';
import { Reservation } from '../types/reservation';

export const registrationService = {
  list(): Reservation[] {
    return getReservations();
  },
  listByStudent(studentId: string): Reservation[] {
    return getReservations().filter((reservation) => reservation.studentId === studentId);
  },
  listByEvents(eventIds: string[]): Reservation[] {
    return getReservations().filter((reservation) => eventIds.includes(reservation.eventId));
  },
  save(reservations: Reservation[]): void {
    saveReservations(reservations);
  },
};
