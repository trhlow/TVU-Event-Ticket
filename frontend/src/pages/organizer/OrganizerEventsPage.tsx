import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, CheckSquare, Edit2, Eye, Lock, Plus, QrCode, Trash2, Unlock } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ConfirmModal from "../../components/common/ConfirmModal";
import DataTable from "../../components/common/DataTable";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import StatusBadge from "../../components/common/StatusBadge";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/common/ToastProvider";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";

export default function OrganizerEventsPage() {
  const currentUser = requireCurrentUser();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      setEvents(await eventService.listByClubRemote(currentUser.clubId || ""));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải danh sách sự kiện.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.clubId, showToast]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleConfirmDelete = async () => {
    if (!deletingEventId) return;
    try {
      await eventService.delete(deletingEventId);
      showToast("Đã xóa sự kiện.");
      setDeletingEventId(null);
      await loadEvents();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Chỉ có thể xóa sự kiện ở trạng thái nháp (DRAFT) theo quy định backend.",
        "error",
      );
    }
  };

  const handleOpenRegistration = async (eventId: string) => {
    setStatusChangingId(eventId);
    try {
      // The backend seeds ticket inventory when the event opens, so the client no
      // longer initializes it -- that endpoint is gone.
      await eventService.changeStatus(eventId, "OPEN");
      showToast("Đã mở đăng ký sự kiện.");
      await loadEvents();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể mở đăng ký sự kiện.", "error");
    } finally {
      setStatusChangingId(null);
    }
  };

  const handleCloseRegistration = async (eventId: string) => {
    setStatusChangingId(eventId);
    try {
      await eventService.changeStatus(eventId, "CLOSED");
      showToast("Đã đóng đăng ký sự kiện.");
      await loadEvents();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể đóng đăng ký sự kiện.", "error");
    } finally {
      setStatusChangingId(null);
    }
  };

  const columns = [
    {
      header: "Tên sự kiện / Thể loại",
      accessor: (event: Event) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-slate-950">{event.title}</span>
          <span className="mt-1 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{event.category}</span>
        </div>
      ),
    },
    {
      header: "Thời gian bắt đầu",
      accessor: (event: Event) => <span className="text-[11px] font-semibold text-slate-700">{formatDateTime(event.startAt)}</span>,
    },
    {
      header: "Vé còn / Sức chứa",
      accessor: (event: Event) => <span className="font-mono font-bold text-slate-900">{event.remainingTickets} / {event.capacity}</span>,
    },
    {
      header: "Trạng thái",
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
    {
      header: "Hành động",
      accessor: (event: Event) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Link to={`/organizer/events/${event.id}`} className="rounded-lg border border-slate-100 p-1.5 text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50" title="Xem chi tiết">
            <Eye className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/organizer/events/${event.id}/edit`} className="rounded-lg border border-slate-100 p-1.5 text-brand-600 transition-colors hover:border-brand-200 hover:bg-brand-50" title="Chỉnh sửa">
            <Edit2 className="h-3.5 w-3.5" />
          </Link>
          {event.status === "DRAFT" && (
            <button
              onClick={() => void handleOpenRegistration(event.id)}
              disabled={statusChangingId === event.id}
              className="cursor-pointer rounded-lg border border-slate-100 p-1.5 text-success-700 transition-colors hover:border-success-200 hover:bg-success-50 disabled:cursor-wait disabled:opacity-60"
              title="Mở đăng ký"
            >
              <Unlock className="h-3.5 w-3.5" />
            </button>
          )}
          {event.status === "OPEN" && (
            <button
              onClick={() => void handleCloseRegistration(event.id)}
              disabled={statusChangingId === event.id}
              className="cursor-pointer rounded-lg border border-slate-100 p-1.5 text-warning-700 transition-colors hover:border-warning-200 hover:bg-warning-50 disabled:cursor-wait disabled:opacity-60"
              title="Đóng đăng ký"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          )}
          <Link to={`/organizer/events/${event.id}/registration-qr`} className="rounded-lg border border-slate-100 p-1.5 text-sky-700 transition-colors hover:border-sky-200 hover:bg-sky-50" title="Liên kết đăng ký">
            <QrCode className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/organizer/events/${event.id}/registrations`} className="rounded-lg border border-slate-100 p-1.5 text-success-700 transition-colors hover:border-success-200 hover:bg-success-50" title="Duyệt đăng ký">
            <CheckSquare className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/organizer/events/${event.id}/statistics`} className="rounded-lg border border-slate-100 p-1.5 text-secondary-700 transition-colors hover:border-secondary-200 hover:bg-secondary-50" title="Thống kê">
            <BarChart3 className="h-3.5 w-3.5" />
          </Link>
          <button onClick={() => setDeletingEventId(event.id)} className="cursor-pointer rounded-lg border border-slate-100 p-1.5 text-danger-600 transition-colors hover:border-danger-200 hover:bg-danger-50" title="Xóa sự kiện">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Quản lý sự kiện câu lạc bộ"
        description="Dữ liệu sự kiện lấy từ /events/mine qua API Gateway."
        actions={
          <Button onClick={() => navigate("/organizer/events/create")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Tạo sự kiện mới
          </Button>
        }
      />

      <div className="enterprise-card p-5">
        {isLoading ? (
          <LoadingSkeleton type="table" count={5} />
        ) : (
          <DataTable data={events} columns={columns} searchPlaceholder="Tìm kiếm tên sự kiện..." searchField="title" />
        )}
      </div>

      {deletingEventId && (
        <ConfirmModal
          isOpen={!!deletingEventId}
          title="Xác nhận xóa sự kiện"
          description="Backend chỉ cho phép xóa sự kiện ở trạng thái nháp (DRAFT). Thao tác sẽ bị từ chối nếu sự kiện đã OPEN/CLOSED."
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEventId(null)}
          confirmText="Xóa sự kiện"
          cancelText="Không"
          type="danger"
        />
      )}
    </div>
  );
}
