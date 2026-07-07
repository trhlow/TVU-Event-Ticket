import React from "react";
import { Calendar, MapPin, Ticket, Users } from "lucide-react";
import { Event } from "../../types/event";
import { formatDateTime } from "../../utils/formatDate";
import StatusBadge from "../common/StatusBadge";
import EventBanner from "./EventBanner";

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
  const isSoldOut = event.remainingTickets === 0 || event.status === "FULL";

  return (
    <article className="enterprise-card flex h-full flex-col overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative h-40 bg-slate-100">
        <EventBanner src={event.bannerUrl} alt={event.title} category={event.category} className="h-40 w-full" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur">
            {event.category}
          </span>
          <StatusBadge type="event" status={event.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">{event.clubName}</p>
        <h3 className="mt-2 line-clamp-2 font-display text-base font-extrabold leading-snug text-slate-950">
          {event.title}
        </h3>

        <div className="mt-4 space-y-2 text-xs font-semibold text-slate-500">
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
              Còn {event.remainingTickets}/{event.capacity} vé
            </span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Trạng thái vé</p>
            <p className={`mt-1 text-sm font-black ${isSoldOut ? "text-rose-600" : "text-emerald-600"}`}>
              {isSoldOut ? "Hết vé" : `${event.remainingTickets} vé còn lại`}
            </p>
          </div>
          <div className="flex gap-2">
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(event.id)}
                className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              >
                {actionText}
              </button>
            )}
            {onRegister && event.status === "OPEN" && !isSoldOut && (
              <button
                onClick={() => onRegister(event.id)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-extrabold text-white transition hover:bg-brand-700"
              >
                <Ticket className="h-3.5 w-3.5" />
                Đăng ký
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
