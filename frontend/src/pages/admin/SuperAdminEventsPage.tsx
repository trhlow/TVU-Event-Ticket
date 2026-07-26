import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Calendar, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { clubService } from '../../services/clubService';
import { Club } from '../../types/club';

export default function SuperAdminEventsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;
    clubService
      .listRemote()
      .then((result) => {
        if (mounted) setClubs(result);
      })
      .catch((error) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách CLB.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Sự kiện toàn trường"
        description="Chọn một CLB để xem các sự kiện mà CLB đó đã tạo."
      />

      {isLoading ? (
        <LoadingSkeleton type="card" count={3} />
      ) : loadError ? (
        <EmptyState title="Không thể tải danh sách CLB" description={loadError} icon={Calendar} />
      ) : clubs.length === 0 ? (
        <EmptyState title="Chưa có CLB" description="Hệ thống chưa có câu lạc bộ nào." icon={Calendar} />
      ) : (
        <div className="enterprise-card divide-y divide-slate-100">
          {clubs.map((club) => (
            <Link
              key={club.id}
              to={`/admin/clubs/${club.id}?tab=events`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <div>
                <p className="font-bold text-slate-950">{club.name}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-400">{club.code}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-brand-700">
                Xem sự kiện <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
