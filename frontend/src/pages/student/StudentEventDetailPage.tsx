import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Info, MapPin, ShieldAlert, Ticket } from "lucide-react";
import { getCurrentUser } from "../../state/authSession";
import Breadcrumb from "../../components/common/Breadcrumb";
import EventBanner from "../../components/events/EventBanner";
import StatusBadge from "../../components/common/StatusBadge";
import Toast from "../../components/common/Toast";
import { eventService } from "../../services/eventService";
import { registrationService } from "../../services/registrationService";
import { formatDateTime } from "../../utils/formatDate";
import { Event } from "../../types/event";
import { Reservation } from "../../types/reservation";

export default function StudentEventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [event, setEvent] = useState<Event | undefined>();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!eventId) return;
      setIsLoading(true);
      try {
        const [eventData, reservationData] = await Promise.all([
          eventService.getPublicEventById(eventId),
          registrationService.listByStudentRemote(currentUser.id).catch(() => [] as Reservation[]),
        ]);
        if (!mounted) return;
        setEvent(eventData);
        setReservations(reservationData);
      } catch (error) {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai chi tiet su kien.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadDetail();
    return () => {
      mounted = false;
    };
  }, [currentUser.id, eventId]);

  const existingReservation = useMemo(
    () => reservations.find((item) => item.eventId === event?.id),
    [event?.id, reservations],
  );

  const handleRegisterClick = () => {
    if (!event) return;
    if (!currentUser.profileComplete) {
      navigate("/student/profile/complete");
      return;
    }
    navigate(`/student/events/${event.id}/register`);
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm font-bold text-gray-500">Dang tai chi tiet su kien...</div>;
  }

  if (!event) {
    return (
      <div className="space-y-4 py-12 text-center font-bold text-gray-400">
        <p>Su kien khong ton tai, da dong, hoac khong con trong cong khai.</p>
        <Link to="/student/events" className="text-brand-600 hover:underline">Quay lai danh sach</Link>
        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
      </div>
    );
  }

  const isSoldOut = event.remainingTickets <= 0 || event.status === "FULL";

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[
        { label: "Sinh vien", path: "/student" },
        { label: "Su kien", path: "/student/events" },
        { label: "Chi tiet" },
      ]} />

      <button
        onClick={() => navigate(-1)}
        className="flex cursor-pointer items-center gap-1.5 text-xs font-extrabold text-gray-500 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Quay lai trang truoc
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="relative h-64 overflow-hidden bg-gray-100 sm:h-80">
              <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-64 w-full sm:h-80" />
              <div className="absolute left-4 top-4 flex gap-2">
                <span className="rounded-xl bg-[#111218]/80 px-3 py-1 text-xs font-black text-white backdrop-blur-xs">
                  {event.category}
                </span>
                <StatusBadge type="event" status={event.status} />
              </div>
            </div>

            <div className="space-y-4 p-6 md:p-8">
              <div className="space-y-1">
                <span className="block text-xs font-extrabold uppercase tracking-wider text-brand-600">{event.clubName}</span>
                <h1 className="text-xl font-black leading-tight tracking-tight text-gray-950 md:text-2xl">{event.title}</h1>
              </div>

              <div className="grid grid-cols-1 gap-4 border-y border-gray-100 py-4 text-xs font-semibold text-gray-700 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="space-y-0.5 text-left">
                    <span className="block text-[10px] font-bold uppercase leading-none text-gray-400">Thoi gian to chuc</span>
                    <span className="mt-1 block font-bold text-gray-900">{formatDateTime(event.startAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="space-y-0.5 text-left">
                    <span className="block text-[10px] font-bold uppercase leading-none text-gray-400">Dia diem to chuc</span>
                    <span className="mt-1 block max-w-[220px] truncate font-bold text-gray-900" title={event.location}>{event.location}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-950">Mo ta su kien</h3>
                <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-gray-600">{event.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="border-b border-gray-100 pb-4">
              <span className="block text-[10px] font-bold uppercase leading-none text-gray-400">Tinh trang ve</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl font-black ${isSoldOut ? "text-rose-600" : "text-emerald-600"}`}>
                  {isSoldOut ? "HET VE" : event.remainingTickets}
                </span>
                {!isSoldOut && <span className="text-xs font-bold text-gray-500">ve kha dung / {event.capacity} cho</span>}
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-semibold text-gray-600">
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase leading-none text-gray-400">Mo dang ky</span>
                  <span className="mt-1 block font-bold text-gray-900">{formatDateTime(event.registrationOpenAt)}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 text-gray-400" />
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase leading-none text-gray-400">Dong dang ky</span>
                  <span className="mt-1 block font-bold text-gray-900">{formatDateTime(event.registrationCloseAt)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              {existingReservation ? (
                <div className="space-y-3 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-gray-50 p-4">
                    <StatusBadge type="reservation" status={existingReservation.status} />
                    <p className="mt-1 text-[11px] font-bold text-gray-500">
                      {existingReservation.status === "PENDING"
                        ? "Ban da gui dang ky. Vui long cho Ban to chuc CLB kiem duyet."
                        : existingReservation.status === "APPROVED"
                          ? "Dang ky da duoc duyet. Ve QR se duoc backend/notification cap qua email neu san sang."
                          : "Yeu cau cua ban da bi tu choi."}
                    </p>
                  </div>
                  {existingReservation.status === "APPROVED" && (
                    <Link
                      to="/student/tickets"
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-brand-700"
                    >
                      <Ticket className="h-4 w-4" /> Di toi vi ve QR
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {event.status === "OPEN" && !isSoldOut ? (
                    <button
                      onClick={handleRegisterClick}
                      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-xs font-black text-white shadow-lg shadow-brand-600/10 transition-all hover:bg-brand-700"
                    >
                      <Ticket className="h-4 w-4 animate-pulse" /> Dang ky ve tham du
                    </button>
                  ) : (
                    <button disabled className="w-full cursor-not-allowed rounded-xl bg-gray-100 py-3 text-xs font-black text-gray-400">
                      {isSoldOut ? "Het ve tham du" : "Su kien hien khong mo dang ky"}
                    </button>
                  )}

                  {!currentUser.profileComplete && (
                    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>Ban chua hoan tat MSSV va lop. He thong yeu cau cap nhat ho so truoc khi dang ky ve.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 text-[11px] font-semibold text-brand-900">
            <p className="flex items-center gap-1 font-extrabold">
              <Info className="h-4 w-4 text-brand-600" /> Luu y quan trong khi nhan ve:
            </p>
            <p className="leading-relaxed">- Moi sinh vien chi gui mot dang ky cho moi su kien.</p>
            <p className="leading-relaxed">- Ve QR hop le duoc cap sau khi Ban to chuc approve reservation.</p>
            <p className="leading-relaxed">- Frontend khong tu tao QR signed; check-in chi nhan payload do backend/notification cap.</p>
          </div>
        </div>
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
