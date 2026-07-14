import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckSquare, Edit2, Eye, Plus, QrCode, Trash2 } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import ConfirmModal from "../../components/common/ConfirmModal";
import DataTable from "../../components/common/DataTable";
import EventForm from "../../components/events/EventForm";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { getCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { ticketService } from "../../services/ticketService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";

export default function OrganizerEventsPage() {
  const currentUser = getCurrentUser();
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
      setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach su kien.");
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
        setToastMsg("Cap nhat su kien thanh cong.");
      } else {
        const created = await eventService.create(data);
        await ticketService.initializeInventory(created.id).catch(() => undefined);
        setToastMsg("Tao su kien moi thanh cong. Ticket inventory da duoc khoi tao neu backend cho phep.");
      }
      setIsFormOpen(false);
      setEditingEvent(undefined);
      await loadEvents();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the luu su kien.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEventId) return;
    try {
      await eventService.delete(deletingEventId);
      setToastMsg("Da xoa su kien.");
      setDeletingEventId(null);
      await loadEvents();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Chi co the xoa su kien DRAFT theo backend.");
    }
  };

  const columns = [
    {
      header: "Ten su kien / The loai",
      accessor: (event: Event) => (
        <div className="text-left font-semibold">
          <span className="block font-bold text-gray-950">{event.title}</span>
          <span className="mt-1 block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{event.category}</span>
        </div>
      ),
    },
    {
      header: "Thoi gian bat dau",
      accessor: (event: Event) => <span className="text-[11px] font-semibold text-gray-700">{formatDateTime(event.startAt)}</span>,
    },
    {
      header: "Ve con / Suc chua",
      accessor: (event: Event) => <span className="font-mono font-bold text-gray-900">{event.remainingTickets} / {event.capacity}</span>,
    },
    {
      header: "Trang thai",
      accessor: (event: Event) => <StatusBadge type="event" status={event.status} />,
    },
    {
      header: "Hanh dong",
      accessor: (event: Event) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Link to={`/organizer/events/${event.id}`} className="rounded-lg border border-gray-100 p-1.5 text-gray-600 transition-colors hover:border-gray-200 hover:bg-gray-50" title="Xem chi tiet">
            <Eye className="h-3.5 w-3.5" />
          </Link>
          <button onClick={() => handleEditClick(event)} className="cursor-pointer rounded-lg border border-gray-100 p-1.5 text-brand-600 transition-colors hover:border-brand-200 hover:bg-brand-50" title="Chinh sua">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <Link to={`/organizer/events/${event.id}/registration-qr`} className="rounded-lg border border-gray-100 p-1.5 text-sky-700 transition-colors hover:border-sky-200 hover:bg-sky-50" title="QR dang ky">
            <QrCode className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/organizer/events/${event.id}/registrations`} className="rounded-lg border border-gray-100 p-1.5 text-emerald-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50" title="Duyet dang ky">
            <CheckSquare className="h-3.5 w-3.5" />
          </Link>
          <Link to={`/organizer/events/${event.id}/statistics`} className="rounded-lg border border-gray-100 p-1.5 text-indigo-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50" title="Thong ke">
            <BarChart3 className="h-3.5 w-3.5" />
          </Link>
          <button onClick={() => setDeletingEventId(event.id)} className="cursor-pointer rounded-lg border border-gray-100 p-1.5 text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50" title="Xoa su kien">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quan ly su kien" }]} />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-gray-950">Quan ly su kien cau lac bo</h2>
          <p className="text-xs font-semibold text-gray-500">Du lieu su kien lay tu /events/mine qua gateway.</p>
        </div>

        {!isFormOpen && (
          <button
            onClick={handleCreateNew}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Tao su kien moi
          </button>
        )}
      </div>

      {isFormOpen ? (
        <div className="animate-fade-in">
          <EventForm
            initialData={editingEvent}
            clubId={currentUser.clubId || ""}
            clubName={currentUser.clubName || "CLB"}
            onSubmit={(data) => void handleFormSubmit(data)}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingEvent(undefined);
            }}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {isLoading ? (
            <div className="py-12 text-center text-sm font-bold text-gray-500">Dang tai su kien...</div>
          ) : (
            <DataTable data={events} columns={columns} searchPlaceholder="Tim kiem ten su kien..." searchField="title" />
          )}
        </div>
      )}

      {deletingEventId && (
        <ConfirmModal
          isOpen={!!deletingEventId}
          title="Xac nhan xoa su kien"
          message="Backend chi cho phep xoa su kien DRAFT. Thao tac se bi tu choi neu su kien da OPEN/CLOSED."
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEventId(null)}
          confirmText="Xoa su kien"
          cancelText="Khong"
          type="danger"
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
