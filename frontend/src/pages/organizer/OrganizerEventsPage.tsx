import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckSquare, Edit2, Eye, Plus, QrCode, Trash2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import ConfirmModal from "../../components/common/ConfirmModal";
import DataTable from "../../components/common/DataTable";
import EventForm from "../../components/events/EventForm";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";

export default function OrganizerEventsPage() {
  const currentUser = requireCurrentUser();
  const [events, setEvents] = useState<Event[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      setEvents(await eventService.listByClubRemote(currentUser.clubId || ""));
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tải danh sách sự kiện.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.clubId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleCreateNew = () => {
    setEditingEvent(undefined);
    setIsFormOpen(true);
  };

  const handleEditClick = (event: Event) => {
    setEditingEvent(event);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (data: Partial<Event>) => {
    try {
      if (editingEvent) {
        await eventService.update(editingEvent.id, data);
        setToastMsg("Cập nhật sự kiện thành công.");
      } else {
        await eventService.create(data);
        setToastMsg("Đã lưu sự kiện mới dưới dạng nháp.");
      }
      setIsFormOpen(false);
      setEditingEvent(undefined);
      await loadEvents();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể lưu sự kiện.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEventId) return;
    try {
      await eventService.delete(deletingEventId);
      setToastMsg("Đã xóa sự kiện.");
      setDeletingEventId(null);
      await loadEvents();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Chỉ có thể xóa sự kiện ở trạng thái nháp (DRAFT) theo quy định backend.");
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
          <button onClick={() => handleEditClick(event)} className="cursor-pointer rounded-lg border border-slate-100 p-1.5 text-brand-600 transition-colors hover:border-brand-200 hover:bg-brand-50" title="Chỉnh sửa">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
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
        breadcrumb={[{ label: "Ban tổ chức", path: "/organizer" }, { label: "Quản lý sự kiện" }]}
        title="Quản lý sự kiện câu lạc bộ"
        description="Dữ liệu sự kiện lấy từ /events/mine qua API Gateway."
        actions={
          !isFormOpen && (
            <button
              onClick={handleCreateNew}
              className="btn-press flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Tạo sự kiện mới
            </button>
          )
        }
      />

      {isFormOpen ? (
        <div className="animate-fade-in">
          <EventForm
            initialData={editingEvent}
            clubId={currentUser.clubId || ""}
            clubName={currentUser.clubName || "CLB"}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingEvent(undefined);
            }}
          />
        </div>
      ) : (
        <div className="enterprise-card p-5">
          {isLoading ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500">Đang tải sự kiện...</div>
          ) : (
            <DataTable data={events} columns={columns} searchPlaceholder="Tìm kiếm tên sự kiện..." searchField="title" />
          )}
        </div>
      )}

      {deletingEventId && (
        <ConfirmModal
          isOpen={!!deletingEventId}
          title="Xác nhận xóa sự kiện"
          message="Backend chỉ cho phép xóa sự kiện ở trạng thái nháp (DRAFT). Thao tác sẽ bị từ chối nếu sự kiện đã OPEN/CLOSED."
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEventId(null)}
          confirmText="Xóa sự kiện"
          cancelText="Không"
          type="danger"
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
