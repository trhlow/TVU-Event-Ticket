import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Copy, Printer, QrCode } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import EmptyState from "../../components/common/EmptyState";
import StatusBadge from "../../components/common/StatusBadge";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/useToast";
import { requireCurrentUser } from "../../state/authSession";
import { eventService } from "../../services/eventService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";

export default function OrganizerRegistrationQRPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(eventId || "");

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await eventService.listByClubRemote(currentUser.clubId || "");
      // Only OPEN events actually accept registrations — offering a DRAFT/CLOSED event here would
      // hand out a QR/link students can open but never successfully submit through.
      const openEvents = data.filter((item) => item.status === "OPEN");
      setEvents(openEvents);
      setSelectedEventId((current) => current || openEvents[0]?.id || "");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải danh sách sự kiện.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.clubId, showToast]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const event = events.find((item) => item.id === selectedEventId) || events[0];
  const registrationLink = event ? `${window.location.origin}/student/events/${event.id}/register` : "";

  const copyLink = async () => {
    if (!navigator.clipboard) {
      showToast("Trình duyệt không hỗ trợ sao chép tự động. Vui lòng bôi đen và sao chép liên kết thủ công.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(registrationLink);
      showToast("Đã sao chép liên kết đăng ký sự kiện.");
    } catch {
      showToast("Không thể sao chép liên kết (trình duyệt từ chối quyền truy cập clipboard).", "error");
    }
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="QR đăng ký sự kiện"
        description="Liên kết dùng để sinh viên mở trang đăng ký sự kiện. Đây là liên kết công khai của Ban tổ chức, không phải vé tham gia."
        actions={
          events.length > 0 && (
            <label className="w-full sm:w-80">
              <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Chọn sự kiện</span>
              <select value={event?.id || ""} onChange={(e) => setSelectedEventId(e.target.value)} className="tvu-input">
                {events.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
          )
        }
      />

      {isLoading ? (
        <LoadingSkeleton type="card" count={1} />
      ) : event ? (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="enterprise-card p-6 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-700">
              <QrCode className="h-4 w-4" /> Liên kết đăng ký
            </div>
            <div className="mx-auto grid h-64 w-64 place-items-center rounded-3xl border border-slate-200 bg-white p-6">
              <QRCodeSVG value={registrationLink} size={208} level="M" includeMargin={false} />
            </div>
            <p className="mt-4 break-all rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
              {registrationLink}
            </p>
          </section>

          <section className="enterprise-card space-y-5 p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge type="event" status={event.status} />
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">
                  Còn {event.remainingTickets}/{event.capacity} vé
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl font-extrabold leading-snug text-slate-950">{event.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{currentUser.clubName || "CLB"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Thời gian tổ chức</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(event.startAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Đóng đăng ký</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(event.registrationCloseAt)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <span>Liên kết này chỉ dùng để mở trang đăng ký sự kiện. Đây không phải là vé tham gia sự kiện.</span>
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4" /> Sao chép liên kết
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> In trang này
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          title="Chưa có sự kiện đang mở đăng ký"
          description="Chỉ sự kiện ở trạng thái Đang mở mới có thể tạo liên kết đăng ký. Hãy mở đăng ký cho sự kiện trước."
          icon={QrCode}
        />
      )}
    </div>
  );
}
