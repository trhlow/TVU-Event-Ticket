import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { mockClubs } from '../../data/mockClubs';
import EventCard from '../../components/events/EventCard';
import EventFilter from '../../components/events/EventFilter';
import PageHeader from '../../components/common/PageHeader';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

export default function StudentEventListPage() {
  const navigate = useNavigate();

  // Filter States
  const [searchValue, setSearchValue] = useState('');
  const [selectedClubId, setSelectedClubId] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      setIsLoading(true);
      setErrorMsg('');
      try {
        const data = await eventService.listRemote();
        if (mounted) setEvents(data);
      } catch (error) {
        if (mounted) setErrorMsg(error instanceof Error ? error.message : 'Không thể tải danh sách sự kiện.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadEvents();
    return () => {
      mounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const list = events.map(e => e.category);
    return Array.from(new Set(list));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchSearch = evt.title.toLowerCase().includes(searchValue.toLowerCase().trim());
      const matchClub = selectedClubId === 'ALL' || evt.clubId === selectedClubId;
      const matchCategory = selectedCategory === 'ALL' || evt.category === selectedCategory;
      const matchStatus = selectedStatus === 'ALL' || evt.status === selectedStatus;
      return matchSearch && matchClub && matchCategory && matchStatus;
    });
  }, [events, searchValue, selectedClubId, selectedCategory, selectedStatus]);

  const handleResetFilters = () => {
    setSearchValue('');
    setSelectedClubId('ALL');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: 'Sinh viên', path: '/student' }, { label: 'Tất cả sự kiện' }]}
        title="Danh sách sự kiện đang diễn ra"
        description="Khám phá hoạt động, đặt chỗ trước và nhận vé QR tham dự điện tử nhanh chóng."
      />

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
      {isLoading ? (
        <div className="py-16 text-center text-sm font-bold text-gray-500">Đang tải danh sách sự kiện...</div>
      ) : errorMsg ? (
        <div className="py-16 text-center bg-white border border-rose-100 rounded-2xl p-8 max-w-lg mx-auto shadow-sm space-y-3">
          <Calendar className="w-12 h-12 text-rose-300 mx-auto" />
          <h4 className="text-sm font-bold text-gray-950">Không thể tải sự kiện</h4>
          <p className="text-xs text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">{errorMsg}</p>
        </div>
      ) : filteredEvents.length > 0 ? (
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
