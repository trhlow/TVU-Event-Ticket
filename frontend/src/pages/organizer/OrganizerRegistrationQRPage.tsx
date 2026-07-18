import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Copy, ExternalLink, Printer, QrCode } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatusBadge from "../../components/common/StatusBadge";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/common/ToastProvider";
import { requireCurrentUser } from "../../state/authSession";
import { getEvents } from "../../data/mockEvents";
import { formatDateTime } from "../../utils/formatDate";

export default function OrganizerRegistrationQRPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const currentUser = requireCurrentUser();
  const { showToast } = useToast();
  const events = getEvents().filter((event) => event.clubId === currentUser.clubId);
  const [selectedEventId, setSelectedEventId] = useState(eventId || events[0]?.id || "");
  const event = events.find((item) => item.id === selectedEventId) || events[0];
  const registrationLink = event ? `${window.location.origin}/student/events/${event.id}/register` : "";

  const copyLink = async () => {
    await navigator.clipboard?.writeText(registrationLink);
    showToast("Đã sao chép liên kết đăng ký sự kiện.");
  };

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Ban tổ chức", path: "/organizer" }, { label: "QR đăng ký sự kiện" }]}
        title="QR đăng ký sự kiện"
        description="Liên kết dùng để sinh viên mở trang đăng ký sự kiện. Đây là liên kết công khai của Ban tổ chức, không phải vé tham gia."
        actions={
          <label className="w-full sm:w-80">
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Chọn sự kiện</span>
            <select value={event?.id || ""} onChange={(e) => setSelectedEventId(e.target.value)} className="tvu-input">
              {events.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
        }
      />

      {event ? (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="enterprise-card p-6 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-700">
              <QrCode className="h-4 w-4" /> Liên kết đăng ký
            </div>
            <div className="mx-auto grid h-64 w-64 place-items-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-xs font-bold leading-5 text-slate-500">
                Chưa có tính năng tạo mã QR thật cho liên kết này. Dùng nút "Sao chép liên kết" bên dưới để chia sẻ.
              </p>
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
              <p className="mt-1 text-sm font-semibold text-slate-500">{event.clubName}</p>
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
              <Button variant="outline" asChild className="sm:col-span-2">
                <Link to={`/student/events/${event.id}/register`}>
                  <ExternalLink className="h-4 w-4" /> Xem trang đăng ký
                </Link>
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="enterprise-card p-10 text-center text-sm font-bold text-slate-500">
          CLB chưa có sự kiện để tạo liên kết đăng ký.
        </div>
      )}
    </div>
  );
}
