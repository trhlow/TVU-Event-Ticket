import { getReservations, saveReservations } from "../data/mockReservations";
import { Reservation } from "../types/reservation";
import { apiConfig, apiRequest, createRequestId } from "./apiClient";

interface ReservationResponse {
  id: string;
  eventId: string;
  clubId: string;
  studentId: string;
  studentEmail: string;
  studentMssv: string;
  eventTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  eventLocation: string;
  status: Reservation["status"];
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  ticketId?: string | null;
}

function mapReservation(response: ReservationResponse): Reservation {
  return {
    id: response.id,
    eventId: response.eventId,
    studentId: response.studentId,
    studentName: response.studentEmail,
    mssv: response.studentMssv || "",
    className: "",
    email: response.studentEmail,
    status: response.status,
    createdAt: response.requestedAt,
  };
}

async function withReservationFallback<T>(request: () => Promise<T>, fallback: () => T): Promise<T> {
  if (apiConfig.useDemoData) return fallback();
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
    return withReservationFallback(
      async () => (await apiRequest<ReservationResponse[]>("/reservations/pending")).map(mapReservation),
      () => getReservations(),
    );
  },
  listByStudent(studentId: string): Reservation[] {
    return getReservations().filter((reservation) => reservation.studentId === studentId);
  },
  async listByStudentRemote(studentId: string): Promise<Reservation[]> {
    return withReservationFallback(
      async () => {
        void studentId;
        return (await apiRequest<ReservationResponse[]>("/reservations/me")).map(mapReservation);
      },
      () => getReservations().filter((reservation) => reservation.studentId === studentId),
    );
  },
  listByEvents(eventIds: string[]): Reservation[] {
    return getReservations().filter((reservation) => eventIds.includes(reservation.eventId));
  },
  async listPendingForOrganizer(): Promise<Reservation[]> {
    return withReservationFallback(
      async () => (await apiRequest<ReservationResponse[]>("/reservations/pending")).map(mapReservation),
      () => getReservations().filter((reservation) => reservation.status === "PENDING"),
    );
  },
  async submit(data: Pick<Reservation, "eventId">): Promise<Reservation> {
    return withReservationFallback(
      async () => mapReservation(await apiRequest<ReservationResponse>("/reservations", {
        method: "POST",
        headers: {
          "Idempotency-Key": createRequestId(),
        },
        body: JSON.stringify({ eventId: data.eventId }),
      })),
      () => {
        const reservation = data as Reservation;
        const next = [reservation, ...getReservations()];
        saveReservations(next);
        return reservation;
      },
    );
  },
  async updateStatus(reservationId: string, status: Reservation["status"], rejectReason?: string): Promise<Reservation> {
    return withReservationFallback(
      async () => {
        if (status === "APPROVED") {
          return mapReservation(await apiRequest<ReservationResponse>(`/reservations/${reservationId}/approve`, { method: "PATCH" }));
        }
        if (status === "REJECTED") {
          void rejectReason;
          return mapReservation(await apiRequest<ReservationResponse>(`/reservations/${reservationId}/reject`, { method: "PATCH" }));
        }
        throw new Error("Backend chi ho tro duyet hoac tu choi dang ky.");
      },
      () => {
        const reservations = getReservations();
        const index = reservations.findIndex((reservation) => reservation.id === reservationId);
        if (index === -1) throw new Error("Reservation not found");
        const updated = { ...reservations[index], status, rejectReason };
        reservations[index] = updated;
        saveReservations(reservations);
        return updated;
      },
    );
  },
  save(reservations: Reservation[]): void {
    saveReservations(reservations);
  },
};
