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
}
