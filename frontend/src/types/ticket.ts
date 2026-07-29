export interface Ticket {
  id: string;
  reservationId?: string;
  eventId: string;
  studentId: string;
  ticketCode: string;
  qrCodeValue?: string;
  studentEmail?: string;
  studentMssv?: string;
  status: 'VALID' | 'EXPIRED' | 'INVALID' | 'CANCELLED';
  checkInStatus: 'PENDING' | 'CHECKED_IN';
  issuedAt: string;
  checkedInAt?: string;
  checkInAt?: string; // compatibility alias
  // Carried over from the approved reservation when available (GET /reservations/me includes them
  // regardless of the event's current status) so callers don't need a second event lookup that 404s
  // for events no longer OPEN.
  eventTitle?: string;
  eventLocation?: string;
  eventStartAt?: string;
}
