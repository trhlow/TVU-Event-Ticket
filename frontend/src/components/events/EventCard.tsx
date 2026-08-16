import React from "react";
import { Calendar, MapPin, Ticket, Users } from "lucide-react";
import { Event } from "../../types/event";
import { formatDateTime } from "../../utils/formatDate";
import StatusBadge from "../common/StatusBadge";
import EventBanner from "./EventBanner";
import { useCardTilt } from "../../hooks/useCardTilt";

interface EventCardProps {
  key?: React.Key;
  event: Event;
  onViewDetails?: (id: string) => void;
  onRegister?: (id: string) => void;
  actionText?: string;
}

export default function EventCard({
  event,
  onViewDetails,
  onRegister,
  actionText = "Xem chi tiết",
}: EventCardProps) {
  const isSoldOut = event.remainingTickets === 0;
  const fillRate = Math.max(0, Math.min(100, Math.round(((event.capacity - event.remainingTickets) / event.capacity) * 100)));
  const tiltRef = useCardTilt<HTMLElement>({ maxTilt: 3 });

  return (
    <article ref={tiltRef} className="enterprise-card tilt-card group flex h-full flex-col overflow-hidden text-left">
      <div className="tilt-card-sheen" aria-hidden="true" />
      <div className="relative h-44 bg-slate-100">
        <EventBanner src={event.bannerUrl} alt={event.title} className="h-44 w-full transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/72 via-slate-950/18 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <StatusBadge type="event" status={event.status} />
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          {event.clubName && (
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/82">{event.clubName}</p>
          )}
          <h3 className="mt-1 line-clamp-2 font-display text-lg font-extrabold leading-snug text-white">
            {event.title}
          </h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="space-y-2 text-sm font-semibold text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-600" />
            <span className="truncate">{formatDateTime(event.startAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-600" />
            <span className="truncate">{event.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <span>
              {event.availabilityUnknown
                ? "Số vé còn lại: không xác định"
                : `Còn ${event.remainingTickets}/${event.capacity} vé`}
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-card border border-blue-100 bg-blue-50/55 p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Tỷ lệ đăng ký</span>
            <span className={isSoldOut ? "text-amber-700" : "text-brand-700"}>{fillRate}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div className={`h-full rounded-full ${isSoldOut ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${fillRate}%` }} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-blue-50 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Trạng thái vé</p>
            <p className={`mt-1 text-sm font-bold ${isSoldOut ? "text-amber-700" : "text-emerald-600"}`}>
              {event.availabilityUnknown ? "Không xác định" : isSoldOut ? "Hết vé" : `${event.remainingTickets} vé còn lại`}
            </p>
          </div>
          <div className="flex gap-2">
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(event.id)}
                className="btn-press h-9 rounded-control border border-blue-100 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-blue-50"
              >
                {actionText}
              </button>
            )}
            {onRegister && event.status === "OPEN" && !isSoldOut && (
              <button
                onClick={() => onRegister(event.id)}
                className="btn-press inline-flex h-9 items-center gap-1.5 rounded-control bg-brand-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <Ticket className="h-4 w-4" />
                Đăng ký
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
