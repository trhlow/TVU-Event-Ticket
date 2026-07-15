import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Calendar, CheckCircle2, ChevronLeft, Clock, ListChecks, MapPin, Ticket, XCircle } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import StatisticCard from "../../components/common/StatisticCard";
import StatusBadge from "../../components/common/StatusBadge";
import ConfirmModal from "../../components/common/ConfirmModal";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import EventBanner from "../../components/events/EventBanner";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { ticketService } from "../../services/ticketService";
import { getCurrentUser } from "../../state/authSession";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";
import { Ticket as IssuedTicket } from "../../types/ticket";

const BASE_BREADCRUMB = [{ label: "Ban tổ chức", path: "/organizer" }, { label: "Quản lý sự kiện", path: "/organizer/events" }];

export default function OrganizerEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const currentUser = getCurrentUser();
  const [event, setEvent] = useState<Event | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<IssuedTicket[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadEventData = useCallback(async () => {
    if (!eventId) return;
    setIsLoading(true);
    try {
      const [events, pendingReservations, issuedTickets] = await Promise.all([
        eventService.listByClubRemote(currentUser.clubId || ""),
        registrationService.listPendingForOrganizer(),
        ticketService.listAttendees(eventId).catch(() => [] as IssuedTicket[]),
      ]);
      setEvent(events.find((item) => item.id === eventId) || null);
      setReservations(pendingReservations.filter((item) => item.eventId === eventId));
      setTickets(issuedTickets);
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể tải chi tiết sự kiện.");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.clubId, eventId]);

  useEffect(() => {
    void loadEventData();
  }, [loadEventData]);

  const stats = useMemo(() => ({
    pending: reservations.filter((item) => item.status === "PENDING").length,
    approved: tickets.length,
    checkedIn: tickets.filter((item) => item.checkInStatus === "CHECKED_IN").length,
    total: reservations.length + tickets.length,
  }), [reservations, tickets]);

  const handleApprove = async (reservationId: string) => {
    setActionId(reservationId);
    try {
      await registrationService.updateStatus(reservationId, "APPROVED");
      setToastMsg("Đã duyệt đăng ký. Backend sẽ cấp vé và gửi email QR bất đồng bộ nếu notification đã sẵn sàng.");
      await loadEventData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể duyệt đăng ký.");
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTargetId) return;
    setActionId(rejectTargetId);
    try {
      await registrationService.updateStatus(rejectTargetId, "REJECTED");
      setToastMsg("Đã từ chối đăng ký.");
      setRejectTargetId(null);
      await loadEventData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể từ chối đăng ký.");
    } finally {
      setActionId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[...BASE_BREADCRUMB, { label: "Chi tiết sự kiện" }]} />
        <div className="enterprise-card p-8 text-center text-sm font-bold text-slate-500">Đang tải chi tiết sự kiện...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb items={[...BASE_BREADCRUMB, { label: "Chi tiết sự kiện" }]} />
        <div className="enterprise-card mx-auto max-w-md p-8 text-center">
          <p className="text-sm font-bold text-slate-950">Không tìm thấy sự kiện trong CLB của tài khoản hiện tại.</p>
          <Link to="/organizer/events" className="mt-3 inline-block text-xs font-bold text-brand-600 hover:underline">
            Quay lại danh sách sự kiện
          </Link>
        </div>
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb items={[...BASE_BREADCRUMB, { label: event.title }]} />

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Link to="/organizer/events" className="btn-press rounded-lg p-1.5 text-slate-500 transition-all hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="space-y-0.5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">{event.title}</h2>
            <p className="text-xs font-semibold text-slate-500">{event.clubName} · {event.category}</p>
          </div>
        </div>
        <StatusBadge type="event" status={event.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatisticCard label="Tổng hiển thị" value={stats.total} icon={ListChecks} />
        <StatisticCard label="Chờ duyệt" value={stats.pending} icon={Clock} color="warning" />
        <StatisticCard label="Vé đã cấp" value={stats.approved} icon={Award} color="success" />
        <StatisticCard label="Đã check-in" value={stats.checkedIn} icon={CheckCircle2} color="primary" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="enterprise-card overflow-hidden">
            <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-44 w-full" />
            <div className="space-y-4 p-5">
              <h3 className="text-sm font-extrabold text-slate-900">Thông tin cơ bản</h3>
              <div className="space-y-3">
                <div className="flex gap-2.5 text-xs font-semibold text-slate-600">
                  <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Thời gian</p>
                    <p className="mt-0.5">{formatDateTime(event.startAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs font-semibold text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Địa điểm</p>
                    <p className="mt-0.5">{event.location}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs font-semibold text-slate-600">
                  <Ticket className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sức chứa</p>
                    <p className="mt-0.5">Còn {event.remainingTickets} / {event.capacity} vé theo availability của backend.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="enterprise-card space-y-3 p-5">
            <h3 className="text-sm font-extrabold text-slate-900">Mô tả sự kiện</h3>
            <p className="text-xs font-semibold leading-relaxed text-slate-600">{event.description || "Chưa có mô tả."}</p>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="enterprise-card space-y-4 p-5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Đăng ký chờ duyệt</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Backend hiện chỉ trả danh sách pending theo CLB; vé đã duyệt xem tại danh sách attendee/vé.</p>
            </div>

            {reservations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-2.5">Sinh viên</th>
                      <th className="py-2.5">MSSV</th>
                      <th className="py-2.5">Trạng thái</th>
                      <th className="py-2.5 text-right">Xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation) => (
                      <tr key={reservation.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3">
                          <p className="font-bold text-slate-950">{reservation.studentName || reservation.email}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{reservation.email}</p>
                        </td>
                        <td className="py-3">
                          <p className="font-mono font-bold text-slate-800">{reservation.mssv || "N/A"}</p>
                        </td>
                        <td className="py-3">
                          <StatusBadge type="reservation" status={reservation.status} />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              disabled={actionId === reservation.id}
                              onClick={() => handleApprove(reservation.id)}
                              className="btn-press cursor-pointer rounded-lg bg-success-500 px-2 py-1 text-[10px] font-bold tracking-tight text-white hover:bg-success-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Duyệt
                            </button>
                            <button
                              disabled={actionId === reservation.id}
                              onClick={() => setRejectTargetId(reservation.id)}
                              className="btn-press cursor-pointer rounded-lg bg-danger-500 px-2 py-1 text-[10px] font-bold tracking-tight text-white hover:bg-danger-600 disabled:cursor-wait disabled:opacity-60"
                            >
                              <XCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Từ chối
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-sm font-bold text-slate-400">Không có đăng ký chờ duyệt cho sự kiện này.</div>
            )}
          </div>
        </div>
      </div>

      {rejectTargetId && (
        <ConfirmModal
          isOpen={!!rejectTargetId}
          title="Từ chối đăng ký"
          description="Backend hiện chỉ nhận thao tác từ chối, không có trường lưu lý do từ chối."
          onConfirm={() => void handleReject()}
          onCancel={() => setRejectTargetId(null)}
          confirmText="Từ chối"
          cancelText="Hủy"
          type="danger"
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
