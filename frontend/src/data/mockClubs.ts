import { Club } from '../types/club';

export const mockClubs: Club[] = [
  {
    id: 'club_it',
    name: 'Câu lạc bộ Tin học (IT Club)',
    code: 'IT_CLUB',
    description: 'Nơi giao lưu, học hỏi và chia sẻ kiến thức về lập trình, thiết kế web và an toàn thông tin.',
    status: 'ACTIVE',
    createdAt: '2025-09-01T08:00:00Z',
  },
  {
    id: 'club_music',
    name: 'Câu lạc bộ Âm nhạc (Music Club)',
    code: 'MUSIC_CLUB',
    description: 'Kết nối những tâm hồn yêu âm nhạc, rèn luyện kỹ năng ca hát, chơi nhạc cụ và biểu diễn.',
    status: 'ACTIVE',
    createdAt: '2025-09-02T08:00:00Z',
  },
  {
    id: 'club_english',
    name: 'Câu lạc bộ Tiếng Anh (English Club)',
    code: 'ENGLISH_CLUB',
    description: 'Tạo môi trường rèn luyện giao tiếp tiếng Anh tự nhiên, học thuật và chuẩn bị kỹ năng hội nhập.',
    status: 'ACTIVE',
    createdAt: '2025-09-03T08:00:00Z',
  },
  {
    id: 'club_volunteer',
    name: 'Đội Tình nguyện Xung kích (Volunteer Club)',
    code: 'VOLUNTEER_CLUB',
    description: 'Tham gia các hoạt động thiện nguyện, bảo vệ môi trường, giúp đỡ trẻ em nghèo và cộng đồng.',
    status: 'INACTIVE',
    createdAt: '2025-09-04T08:00:00Z',
  }
];
