import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Ticket,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { getEvents } from "../../data/mockEvents";
import { getReservations, saveReservations } from "../../data/mockReservations";
import { getTickets, saveTickets } from "../../data/mockTickets";
import { saveEvents } from "../../data/mockEvents";
import Breadcrumb from "../../components/common/Breadcrumb";
import StatusBadge from "../../components/common/StatusBadge";
import { formatDateTime } from "../../utils/formatDate";
import EventBanner from "../../components/events/EventBanner";

export default function OrganizerEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const event = getEvents().find((e) => e.id === eventId);

  const [reservations, setReservations] = useState(() =>
    getReservations().filter((r) => r.eventId === eventId),
  );

  const tickets = getTickets().filter((t) => t.eventId === eventId);

  const stats = {
    total: reservations.length,
    approved: reservations.filter((r) => r.status === "APPROVED").length,
    pending: reservations.filter((r) => r.status === "PENDING").length,
    rejected: reservations.filter((r) => r.status === "REJECTED").length,
    checkedIn: tickets.filter((t) => t.checkInStatus === "CHECKED_IN").length,
  };

  const handleApprove = (resId: string) => {
    if (!event) return;
    if (event.remainingTickets <= 0) {
      alert("Không thể duyệt! Số lượng vé phát hành của sự kiện đã hết.");
      return;
    }

    const confirmApprove = window.confirm(
      "Xác nhận duyệt đăng ký? Hệ thống sẽ giữ chỗ 01 vé sự kiện và tự động phát hành mã vé QR điện tử gửi tới sinh viên.",
    );
    if (!confirmApprove) return;

    // Update reservation
    const allReservations = getReservations();
    const resIndex = allReservations.findIndex((r) => r.id === resId);
    if (resIndex === -1) return;

    allReservations[resIndex].status = "APPROVED";
    saveReservations(allReservations);
    setReservations(allReservations.filter((r) => r.eventId === eventId));

    // Create ticket
    const allTickets = getTickets();
    const newTicket = {
      id: `tkt_new_${Date.now()}`,
      eventId: event.id,
      studentId: allReservations[resIndex].studentId,
      ticketCode: `TVU-${event.id.replace("event_", "").toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      status: "VALID" as const,
      checkInStatus: "PENDING" as const,
      issuedAt: new Date().toISOString(),
    };
    allTickets.unshift(newTicket);
    saveTickets(allTickets);

    // Decrement remaining tickets
    const allEvents = getEvents();
    const evtIndex = allEvents.findIndex((e) => e.id === event.id);
    if (evtIndex !== -1) {
      allEvents[evtIndex].remainingTickets = Math.max(
        0,
        allEvents[evtIndex].remainingTickets - 1,
      );
      if (allEvents[evtIndex].remainingTickets === 0) {
        allEvents[evtIndex].status = "FULL";
      }
    }
    saveEvents(allEvents);

    alert("Đã phê duyệt đăng ký thành công và cấp vé QR!");
  };

  const handleReject = (resId: string) => {
    const reason = window.prompt("Nhập lý do từ chối đăng ký tham gia sự kiện này:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Phải nhập lý do từ chối!");
      return;
    }

    const allReservations = getReservations();
    const resIndex = allReservations.findIndex((r) => r.id === resId);
    if (resIndex === -1) return;

    allReservations[resIndex].status = "REJECTED";
    allReservations[resIndex].rejectReason = reason;
    saveReservations(allReservations);
    setReservations(allReservations.filter((r) => r.eventId === eventId));

    alert("Đã từ chối đăng ký.");
  };

  if (!event) {
    return (
      <div className="space-y-6 text-left">
        <Breadcrumb
          items={[
            { label: "Ban tổ chức", path: "/organizer" },
            { label: "Quản lý sự kiện", path: "/organizer/events" },
            { label: "Chi tiết sự kiện" },
          ]}
        />
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-md mx-auto space-y-3">
          <p className="text-sm font-bold text-gray-950">
            Sự kiện không tồn tại hoặc đã bị xóa
          </p>
          <Link
            to="/organizer/events"
            className="inline-block text-xs font-bold text-brand-600 hover:underline"
          >
            Quay lại danh sách sự kiện
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb
        items={[
          { label: "Ban tổ chức", path: "/organizer" },
          { label: "Quản lý sự kiện", path: "/organizer/events" },
          { label: event.title },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            to="/organizer/events"
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="space-y-0.5">
            <h2 className="text-xl font-black text-gray-950 tracking-tight">
              {event.title}
            </h2>
            <p className="text-xs text-gray-500 font-semibold">
              {event.clubName} • Thể loại: {event.category}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <StatusBadge
            type="event"
            status={event.status}
          />
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left">
          <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block">
            Tổng Đăng Ký
          </span>
          <span className="text-xl font-black text-gray-900 block mt-1">
            {stats.total}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left">
          <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider block">
            Đã Duyệt
          </span>
          <span className="text-xl font-black text-emerald-600 block mt-1">
            {stats.approved}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left">
          <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">
            Chờ Duyệt
          </span>
          <span className="text-xl font-black text-amber-500 block mt-1">
            {stats.pending}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left">
          <span className="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider block">
            Đã Từ Chối
          </span>
          <span className="text-xl font-black text-rose-500 block mt-1">
            {stats.rejected}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm text-left col-span-2 md:col-span-1">
          <span className="text-[10px] text-brand-600 font-extrabold uppercase tracking-wider block">
            Đã Check-in
          </span>
          <span className="text-xl font-black text-brand-600 block mt-1">
            {stats.checkedIn}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Event Info Cards */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <EventBanner
              src={event.bannerUrl}
              alt={event.title}
              category={event.category}
              className="h-44 w-full"
            />
            <div className="p-5 space-y-4">
              <h3 className="font-extrabold text-gray-900 text-sm">
                Thông tin cơ bản
              </h3>
              <div className="space-y-3">
                <div className="flex gap-2.5 text-xs text-gray-600 font-semibold">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      Thời gian
                    </p>
                    <p className="mt-0.5">{formatDateTime(event.startAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs text-gray-600 font-semibold">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      Địa điểm
                    </p>
                    <p className="mt-0.5">{event.location}</p>
                  </div>
                </div>
                <div className="flex gap-2.5 text-xs text-gray-600 font-semibold">
                  <Ticket className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      Số lượng vé
                    </p>
                    <p className="mt-0.5">
                      Đã cấp {event.capacity - event.remainingTickets} /{" "}
                      {event.capacity} vé ({event.remainingTickets} vé trống)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-extrabold text-gray-900 text-sm">Mô tả sự kiện</h3>
            <p className="text-xs text-gray-600 font-semibold leading-relaxed">
              {event.description}
            </p>
          </div>
        </div>

        {/* List of Registrations for this specific event */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-extrabold text-gray-900 text-sm">
              Danh sách đăng ký sự kiện này
            </h3>
            {reservations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-gray-600 font-semibold">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5">Học Viên</th>
                      <th className="py-2.5">MSSV / Lớp</th>
                      <th className="py-2.5">Trạng Thái</th>
                      <th className="py-2.5 text-right">Duyệt nhanh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((res) => (
                      <tr
                        key={res.id}
                        className="border-b border-gray-50 hover:bg-gray-50/50"
                      >
                        <td className="py-3">
                          <p className="font-bold text-gray-950">
                            {res.studentName}
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold">
                            {res.email}
                          </p>
                        </td>
                        <td className="py-3">
                          <p className="font-bold text-gray-800 font-mono">
                            {res.mssv}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {res.className}
                          </p>
                        </td>
                        <td className="py-3">
                          <StatusBadge
                            type="reservation"
                            status={res.status}
                          />
                        </td>
                        <td className="py-3 text-right">
                          {res.status === "PENDING" ? (
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => handleApprove(res.id)}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold tracking-tight cursor-pointer"
                              >
                                Duyệt
                              </button>
                              <button
                                onClick={() => handleReject(res.id)}
                                className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-bold tracking-tight cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </div>
                          ) : res.status === "APPROVED" ? (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-rose-600 font-bold flex items-center gap-1 justify-end"
                              title={res.rejectReason}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Bị từ chối
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400 font-bold">
                Chưa có sinh viên nào đăng ký tham dự sự kiện này.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
