import React from "react";
import { Calendar, Download, MapPin, Printer, ShieldCheck } from "lucide-react";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";
import StatusBadge from "../common/StatusBadge";
import { formatDateTime } from "../../utils/formatDate";
import { useCardTilt } from "../../hooks/useCardTilt";

interface QRDisplayCardProps {
  ticket: Ticket;
  event: Event;
  onDownload?: () => void;
  onPrint?: () => void;
}

export default function QRDisplayCard({ ticket, event, onDownload, onPrint }: QRDisplayCardProps) {
  const hasQrPayload = Boolean(ticket.qrCodeValue);
  const tiltRef = useCardTilt<HTMLDivElement>({ maxTilt: 5 });

  return (
    <div ref={tiltRef} className="tilt-card mx-auto max-w-sm overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-xl shadow-brand-900/10">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-600 to-accent-500 p-5 text-left text-white">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">TVU Electronic Ticket</p>
        <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{event.title}</h3>
        <p className="mt-1.5 text-sm font-medium text-white/82">{event.clubName}</p>
        <div className="mt-4">
          <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
        </div>
      </div>

      <div className="p-5 text-center">
        <div className="mx-auto grid h-56 w-56 place-items-center rounded-2xl border border-slate-200 bg-white p-3 shadow-inner">
          {hasQrPayload ? (
            // The backend supplies a real signed payload here, but no QR-rendering library is
            // wired up yet — showing the raw payload is honest; a fabricated checkerboard image
            // that doesn't actually encode this string would not be.
            <div className="px-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payload vé (chưa có bộ render QR)</p>
              <p className="mt-2 break-all font-mono text-[11px] font-semibold leading-5 text-slate-700">{ticket.qrCodeValue}</p>
            </div>
          ) : (
            <div className="px-4 text-center text-xs font-bold leading-5 text-slate-500">
              Backend chưa cung cấp QR payload cho vé này.
            </div>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Mã vé</p>
          <p className="mt-1 font-mono text-sm font-semibold tracking-wider text-slate-950">{ticket.ticketCode}</p>
        </div>
        <div className="mt-4 grid gap-2 text-left text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Calendar className="h-4 w-4 text-brand-600" />
            <span>{formatDateTime(event.startAt)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <MapPin className="h-4 w-4 text-brand-600" />
            <span>{event.location}</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="flex items-start gap-2 text-xs font-medium leading-5 text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Không chia sẻ mã QR cho người khác. Mỗi mã QR chỉ được điểm danh một lần.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onDownload}
            className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Tải vé
          </button>
          <button onClick={onPrint} className="btn-press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">
            <Printer className="h-4 w-4" />
            In vé
          </button>
        </div>
      </div>
    </div>
  );
}
