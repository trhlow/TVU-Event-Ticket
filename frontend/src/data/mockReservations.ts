import { Reservation } from '../types/reservation';
import { getEvents } from './mockEvents';

type ReservationFixture = Omit<Reservation, 'eventTitle' | 'eventLocation' | 'eventStartAt'>;

function withEventInfo(reservations: ReservationFixture[]): Reservation[] {
  const events = getEvents();
  return reservations.map((reservation) => {
    const event = events.find((item) => item.id === reservation.eventId);
    return {
      ...reservation,
      eventTitle: event?.title || '',
      eventLocation: event?.location || '',
      eventStartAt: event?.startAt || '',
    };
  });
}

const INITIAL_RESERVATIONS: ReservationFixture[] = [
  {
    id: 'res_1',
    eventId: 'event_it_1',
    studentId: 'user_std_1',
    studentName: 'Nguyễn Văn A',
    mssv: '110121001',
    className: 'DA21TT',
    email: 'anv.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-06-26T09:15:00Z',
  },
  {
    id: 'res_2',
    eventId: 'event_it_1',
    studentId: 'user_std_2',
    studentName: 'Trần Thị B',
    mssv: '110120045',
    className: 'DA21QT',
    email: 'btt.student@tvu.edu.vn',
    status: 'PENDING',
    createdAt: '2026-06-27T10:30:00Z',
  },
  {
    id: 'res_3',
    eventId: 'event_it_1',
    studentId: 'user_std_3',
    studentName: 'Lê Minh C',
    mssv: '110121089',
    className: 'DA21KT',
    email: 'clm.student@tvu.edu.vn',
    status: 'REJECTED',
    rejectReason: 'Không đúng đối tượng sinh viên đăng ký môn học liên quan.',
    createdAt: '2026-06-26T08:00:00Z',
  },
  {
    id: 'res_4',
    eventId: 'event_music_1',
    studentId: 'user_std_1',
    studentName: 'Nguyễn Văn A',
    mssv: '110121001',
    className: 'DA21TT',
    email: 'anv.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-07-01T14:20:00Z',
  },
  {
    id: 'res_5',
    eventId: 'event_music_1',
    studentId: 'user_std_2',
    studentName: 'Trần Thị B',
    mssv: '110120045',
    className: 'DA21QT',
    email: 'btt.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-07-02T11:00:00Z',
  },
  {
    id: 'res_6',
    eventId: 'event_music_1',
    studentId: 'user_std_5',
    studentName: 'Nguyễn Thị Hương',
    mssv: '110122154',
    className: 'DA22TT',
    email: 'huongnt.student@tvu.edu.vn',
    status: 'PENDING',
    createdAt: '2026-07-02T16:45:00Z',
  },
  {
    id: 'res_7',
    eventId: 'event_it_1',
    studentId: 'user_std_5',
    studentName: 'Nguyễn Thị Hương',
    mssv: '110122154',
    className: 'DA22TT',
    email: 'huongnt.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-06-28T09:30:00Z',
  },
  {
    id: 'res_8',
    eventId: 'event_english_2',
    studentId: 'user_std_1',
    studentName: 'Nguyễn Văn A',
    mssv: '110121001',
    className: 'DA21TT',
    email: 'anv.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-06-11T13:00:00Z',
  },
  {
    id: 'res_9',
    eventId: 'event_english_2',
    studentId: 'user_std_3',
    studentName: 'Lê Minh C',
    mssv: '110121089',
    className: 'DA21KT',
    email: 'clm.student@tvu.edu.vn',
    status: 'APPROVED',
    createdAt: '2026-06-12T08:15:00Z',
  },
  {
    id: 'res_10',
    eventId: 'event_english_2',
    studentId: 'user_std_7',
    studentName: 'Đặng Quốc Khánh',
    mssv: '110121012',
    className: 'DA21QT',
    email: 'khanhdq.student@tvu.edu.vn',
    status: 'REJECTED',
    rejectReason: 'Đăng ký quá hạn quy định của câu lạc bộ.',
    createdAt: '2026-06-26T10:00:00Z',
  },
  {
    id: 'res_11',
    eventId: 'event_music_1',
    studentId: 'user_std_8',
    studentName: 'Hoàng Mỹ Linh',
    mssv: '110121123',
    className: 'DA21KT',
    email: 'linhhm.student@tvu.edu.vn',
    status: 'PENDING',
    createdAt: '2026-07-02T22:30:00Z',
  },
  {
    id: 'res_12',
    eventId: 'event_music_1',
    studentId: 'user_std_9',
    studentName: 'Phan Thanh Hải',
    mssv: '110122045',
    className: 'DA22QT',
    email: 'haipt.student@tvu.edu.vn',
    status: 'PENDING',
    createdAt: '2026-07-03T01:10:00Z',
  }
];

const STORAGE_KEY = 'tvu_event_ticket_reservations_v1';

export function getReservations(): Reservation[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return withEventInfo(INITIAL_RESERVATIONS);
}

export function saveReservations(reservations: Reservation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
}

export const mockReservations: Reservation[] = getReservations();
