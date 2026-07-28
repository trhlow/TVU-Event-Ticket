import { Reservation } from "../types/reservation";
import { apiRequest, createRequestId } from "./apiClient";

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
    // ReservationResponse has no student display-name or class-code field yet (see
    // backend/docs/BACKEND_SECURITY_REQUIREMENTS.md item 15) — leave both unset rather than fabricating
    // a name from the email; callers already fall back to showing the email when name is empty.
    id: response.id,
    eventId: response.eventId,
    eventTitle: response.eventTitle || "",
    eventLocation: response.eventLocation || "",
    eventStartAt: response.eventStartAt || "",
    studentId: response.studentId,
    studentName: "",
    mssv: response.studentMssv || "",
    className: "",
    email: response.studentEmail,
    status: response.status,
    createdAt: response.requestedAt,
  };
}

export const registrationService = {
  async listRemote(): Promise<Reservation[]> {
    return (await apiRequest<ReservationResponse[]>("/reservations/pending")).map(mapReservation);
  },
  async listByStudentRemote(studentId: string): Promise<Reservation[]> {
    void studentId;
    return (await apiRequest<ReservationResponse[]>("/reservations/me")).map(mapReservation);
  },
  async listPendingForOrganizer(): Promise<Reservation[]> {
    return (await apiRequest<ReservationResponse[]>("/reservations/pending")).map(mapReservation);
  },
  async submit(data: Pick<Reservation, "eventId">): Promise<Reservation> {
    return mapReservation(await apiRequest<ReservationResponse>("/reservations", {
      method: "POST",
      headers: {
        "Idempotency-Key": createRequestId(),
      },
      body: JSON.stringify({ eventId: data.eventId }),
    }));
  },
  async updateStatus(reservationId: string, status: Reservation["status"], rejectReason?: string): Promise<Reservation> {
    if (status === "APPROVED") {
      return mapReservation(await apiRequest<ReservationResponse>(`/reservations/${reservationId}/approve`, { method: "POST" }));
    }
    if (status === "REJECTED") {
      void rejectReason;
      return mapReservation(await apiRequest<ReservationResponse>(`/reservations/${reservationId}/reject`, { method: "POST" }));
    }
    throw new Error("Chỉ hỗ trợ duyệt hoặc từ chối đăng ký.");
  },
};
