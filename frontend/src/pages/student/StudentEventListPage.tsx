import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Calendar } from 'lucide-react';
import EventCard from '../../components/events/EventCard';
import EventFilter from '../../components/events/EventFilter';
import PageHeader from '../../components/common/PageHeader';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { eventService } from '../../services/eventService';
import { Event } from '../../types/event';

export default function StudentEventListPage() {
  const navigate = useNavigate();

  // Filter States
  const [searchValue, setSearchValue] = useState('');
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

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchSearch = evt.title.toLowerCase().includes(searchValue.toLowerCase().trim());
      const matchStatus = selectedStatus === 'ALL' || evt.status === selectedStatus;
      return matchSearch && matchStatus;
    });
  }, [events, searchValue, selectedStatus]);

  const handleResetFilters = () => {
    setSearchValue('');
    setSelectedStatus('ALL');
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Danh sách sự kiện đang diễn ra"
        description="Khám phá hoạt động, đặt chỗ trước và nhận vé QR tham dự điện tử nhanh chóng."
      />

      {/* Filter panel */}
      <EventFilter
        searchValue={searchValue}
        selectedStatus={selectedStatus}
        onSearchChange={setSearchValue}
        onStatusChange={setSelectedStatus}
        onReset={handleResetFilters}
      />

      {/* Events list */}
      {isLoading ? (
        <LoadingSkeleton type="card" count={6} />
      ) : errorMsg ? (
        <EmptyState icon={Calendar} title="Không thể tải sự kiện" description={errorMsg} />
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
        <EmptyState
          icon={Calendar}
          title="Không tìm thấy sự kiện nào"
          description="Hãy thử điều chỉnh từ khóa tìm kiếm hoặc bộ lọc để xem thêm sự kiện."
          actionText="Đặt lại bộ lọc"
          onAction={handleResetFilters}
        />
      )}
    </div>
  );
}
