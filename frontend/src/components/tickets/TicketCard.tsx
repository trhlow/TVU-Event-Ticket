import React from "react";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";
import { Calendar, MapPin, QrCode, ClipboardCheck } from "lucide-react";
import StatusBadge from "../common/StatusBadge";
import { formatDateTime } from "../../utils/formatDate";
import { useCardTilt } from "../../hooks/useCardTilt";

interface TicketCardProps {
  key?: React.Key;
  ticket: Ticket;
  event: Event;
  onViewQR: (ticketId: string) => void;
}

export default function TicketCard({ ticket, event, onViewQR }: TicketCardProps) {
  const isCheckedIn = ticket.checkInStatus === "CHECKED_IN";
  const canShowQR = ticket.status === "VALID" && !isCheckedIn;
  const tiltRef = useCardTilt<HTMLDivElement>({ maxTilt: 2.5 });

  return (
    <div ref={tiltRef} className="enterprise-card tilt-card relative flex overflow-hidden text-left md:flex-row">
      <div className="tilt-card-sheen" aria-hidden="true" />
      <div className="absolute bottom-0 left-44 top-0 hidden w-px border-l border-dashed border-slate-200 md:block" />
      <div className="flex w-full shrink-0 flex-col items-center justify-center border-b border-dashed border-slate-200 bg-gradient-to-br from-brand-50 to-white p-5 text-center md:w-44 md:border-b-0 md:border-r">
        <div className={`mb-3 grid h-11 w-11 place-items-center rounded-2xl border shadow-sm ${isCheckedIn ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-brand-100 bg-white text-brand-700"}`}>
          <QrCode className="h-7 w-7" />
        </div>
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400">Mã vé</span>
        <span className="mt-1 block break-all font-mono text-xs font-semibold text-slate-950">{ticket.ticketCode}</span>
        <div className="mt-3">
          <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">{event.clubName}</span>
              <h4 className="mt-1 line-clamp-2 font-display text-base font-semibold leading-snug text-slate-950">{event.title}</h4>
            </div>
          </div>

          <div className="grid gap-2 text-sm font-semibold text-slate-500 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-600" />
              <span>{formatDateTime(event.startAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-brand-600" />
              <span className="truncate">{event.location}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-left">
            <span className="block text-[10px] font-bold uppercase leading-none text-slate-400">Cấp ngày</span>
            <span className="mt-1 block text-xs font-bold text-slate-600">{formatDateTime(ticket.issuedAt)}</span>
          </div>

          {isCheckedIn ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
              <ClipboardCheck className="h-4 w-4" /> Đã điểm danh
            </span>
          ) : canShowQR ? (
            <button
              onClick={() => onViewQR(ticket.id)}
              className="btn-press flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <QrCode className="h-4 w-4" />
              Hiển thị QR vé
            </button>
          ) : (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
              Không còn hiệu lực
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
