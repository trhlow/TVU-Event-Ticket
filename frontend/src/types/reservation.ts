export interface Reservation {
  id: string;
  eventId: string;
  studentId: string;
  studentName: string;
  mssv: string;
  className: string;
  email: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string;
  createdAt: string;
}
