import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { mockEvents } from '../../data/mockEvents';
import { mockClubs } from '../../data/mockClubs';
import EventCard from '../../components/events/EventCard';
import EventFilter from '../../components/events/EventFilter';
import Breadcrumb from '../../components/common/Breadcrumb';

export default function StudentEventListPage() {
  const navigate = useNavigate();

  // Filter States
  const [searchValue, setSearchValue] = useState('');
  const [selectedClubId, setSelectedClubId] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const categories = useMemo(() => {
    const list = mockEvents.map(e => e.category);
    return Array.from(new Set(list));
  }, []);

  const filteredEvents = useMemo(() => {
    return mockEvents.filter((evt) => {
      const matchSearch = evt.title.toLowerCase().includes(searchValue.toLowerCase().trim());
      const matchClub = selectedClubId === 'ALL' || evt.clubId === selectedClubId;
      const matchCategory = selectedCategory === 'ALL' || evt.category === selectedCategory;
      const matchStatus = selectedStatus === 'ALL' || evt.status === selectedStatus;
      return matchSearch && matchClub && matchCategory && matchStatus;
    });
  }, [searchValue, selectedClubId, selectedCategory, selectedStatus]);

  const handleResetFilters = () => {
    setSearchValue('');
    setSelectedClubId('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Tất cả sự kiện' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Danh Sách Sự Kiện Đang Diễn Ra</h2>
        <p className="text-xs text-gray-500 font-semibold">Khám phá hoạt động, đặt chỗ trước và nhận vé QR tham dự điện tử nhanh chóng</p>
      </div>

      {/* Filter panel */}
      <EventFilter
        clubs={mockClubs}
        categories={categories}
        searchValue={searchValue}
        selectedClubId={selectedClubId}
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
        onSearchChange={setSearchValue}
        onClubChange={setSelectedClubId}
        onCategoryChange={setSelectedCategory}
        onStatusChange={setSelectedStatus}
        onReset={handleResetFilters}
      />

      {/* Events list */}
      {filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredEvents.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onViewDetails={(id) => navigate(`/student/events/${id}`)}
              onRegister={(id) => navigate(`/student/events/${id}/register`)}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center bg-white border border-gray-200 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-3">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto" />
          <h4 className="text-sm font-bold text-gray-950">Không tìm thấy sự kiện nào</h4>
          <p className="text-xs text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">
            Hãy điều chỉnh từ khóa tìm kiếm hoặc các tiêu chí lọc danh mục để hiển thị thêm thông tin sự kiện Đoàn Hội nhé.
          </p>
        </div>
      )}
    </div>
  );
}
