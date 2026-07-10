import { Event } from '../types/event';

const INITIAL_EVENTS: Event[] = [
  {
    id: 'event_it_1',
    clubId: 'club_it',
    clubName: 'CLB Tin học (IT Club)',
    title: 'Hội thảo Công nghệ Web & Trí tuệ nhân tạo (AI) 2026',
    description: 'Sự kiện thường niên mang tới các góc nhìn chuyên sâu về hệ sinh thái Frontend hiện đại kết hợp với Gemini API, WebAI và ứng dụng thực tiễn trong phát triển phần mềm doanh nghiệp.',
    category: 'Học thuật',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60',
    location: 'Hội trường Khoa Kỹ thuật & Công nghệ (Khu I)',
    startAt: '2026-07-15T08:00:00Z',
    endAt: '2026-07-15T11:30:00Z',
    registrationOpenAt: '2026-06-25T00:00:00Z',
    registrationCloseAt: '2026-07-10T23:59:00Z',
    capacity: 150,
    remainingTickets: 147,
    status: 'OPEN',
  },
  {
    id: 'event_music_1',
    clubId: 'club_guitar',
    clubName: 'CLB Guitar & Văn nghệ Xung kích',
    title: 'Đêm nhạc acoustic "Giai Điệu Hạ Vàng 2026"',
    description: 'Chương trình ca nhạc acoustic ngoài trời với sự tham gia biểu diễn của các band nhạc học sinh, sinh viên xuất sắc toàn trường. Chào đón một mùa hè sôi động, nhiệt huyết.',
    category: 'Văn nghệ',
    bannerUrl: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop&q=60',
    location: 'Sân trung tâm học tập sinh viên (Khu I)',
    startAt: '2026-07-20T18:30:00Z',
    endAt: '2026-07-20T21:30:00Z',
    registrationOpenAt: '2026-07-01T08:00:00Z',
    registrationCloseAt: '2026-07-18T18:00:00Z',
    capacity: 250,
    remainingTickets: 247,
    status: 'OPEN',
  },
  {
    id: 'event_english_1',
    clubId: 'club_english',
    clubName: 'CLB Tiếng Anh (ETC)',
    title: 'Cuộc thi tranh biện Tiếng Anh "TEDx TVU Youth"',
    description: 'Sân chơi kỹ năng hùng biện tiếng Anh học thuật cho toàn thể học viên, sinh viên Đại học Trà Vinh. Giúp rèn luyện tư duy phản biện, làm việc nhóm, tự tin thuyết trình.',
    category: 'Cuộc thi',
    bannerUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=60',
    location: 'Phòng đa năng - Thư viện số TVU',
    startAt: '2026-07-10T13:30:00Z',
    endAt: '2026-07-10T16:30:00Z',
    registrationOpenAt: '2026-06-15T00:00:00Z',
    registrationCloseAt: '2026-07-08T23:59:00Z',
    capacity: 80,
    remainingTickets: 0,
    status: 'FULL',
  },
  {
    id: 'event_green_1',
    clubId: 'club_green',
    clubName: 'CLB Môi trường xanh (Green TVU)',
    title: 'Chiến dịch trồng cây bảo vệ rừng ngập mặn 2026',
    description: 'Phát huy tinh thần tình nguyện xanh của tuổi trẻ TVU. Hoạt động thực tế di chuyển bằng xe bus trường xuống bãi bồi ven biển Trà Vinh tham gia trồng rừng đước chắn sóng.',
    category: 'Tình nguyện',
    bannerUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=60',
    location: 'Huyện Duyên Hải, Tỉnh Trà Vinh (Xe đưa đón)',
    startAt: '2026-07-18T06:00:00Z',
    endAt: '2026-07-18T17:00:00Z',
    registrationOpenAt: '2026-07-05T00:00:00Z',
    registrationCloseAt: '2026-07-15T23:59:00Z',
    capacity: 50,
    remainingTickets: 50,
    status: 'UPCOMING',
  },
  {
    id: 'event_english_2',
    clubId: 'club_english',
    clubName: 'CLB Tiếng Anh (ETC)',
    title: 'Workshop phát triển kỹ năng giao tiếp công sở 2026',
    description: 'Buổi chia sẻ kiến thức hữu ích đến từ các diễn giả, cựu sinh viên thành đạt về chủ đề kỹ năng viết email tiếng Anh và giao tiếp nhóm đa văn hóa.',
    category: 'Kỹ năng',
    bannerUrl: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&auto=format&fit=crop&q=60',
    location: 'Hội trường B - Khoa Ngoại ngữ',
    startAt: '2026-06-20T08:00:00Z',
    endAt: '2026-06-20T11:00:00Z',
    registrationOpenAt: '2026-06-05T00:00:00Z',
    registrationCloseAt: '2026-06-15T23:59:00Z',
    capacity: 120,
    remainingTickets: 118,
    status: 'ENDED',
  }
];

const STORAGE_KEY = 'tvu_event_ticket_events_v1';

export function getEvents(): Event[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return INITIAL_EVENTS;
}

export function saveEvents(events: Event[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export const mockEvents: Event[] = getEvents();
export const mockCategories = ['Học thuật', 'Văn nghệ', 'Cuộc thi', 'Tình nguyện', 'Kỹ năng'];
