import React from "react";
import { Calendar, Download, MapPin, Printer, ShieldCheck } from "lucide-react";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";
import StatusBadge from "../common/StatusBadge";
import { formatDateTime } from "../../utils/formatDate";

interface QRDisplayCardProps {
  ticket: Ticket;
  event: Event;
  onDownload?: () => void;
  onPrint?: () => void;
}

function FakeQRCode() {
  const cells = Array.from({ length: 121 }, (_, index) => {
    const finder =
      (Math.floor(index / 11) < 3 && index % 11 < 3) ||
      (Math.floor(index / 11) < 3 && index % 11 > 7) ||
      (Math.floor(index / 11) > 7 && index % 11 < 3);
    const filled = finder || [5, 9, 14, 18, 24, 29, 35, 41, 44, 50, 57, 63, 69, 72, 78, 83, 89, 94, 101, 108, 115].includes(index);
    return <span key={index} className={filled ? "rounded-[2px] bg-slate-950" : "rounded-[2px] bg-white"} />;
  });

  return <div className="grid h-full w-full grid-cols-11 gap-1 rounded-2xl bg-white p-4">{cells}</div>;
}

export default function QRDisplayCard({ ticket, event, onDownload, onPrint }: QRDisplayCardProps) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-[28px] border border-brand-100 bg-white shadow-2xl shadow-brand-900/12">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-600 to-accent-500 p-6 text-left text-white">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">TVU Electronic Ticket</p>
        <h3 className="mt-3 font-display text-xl font-extrabold leading-snug">{event.title}</h3>
        <p className="mt-2 text-sm font-semibold text-white/82">{event.clubName}</p>
        <div className="mt-4">
          <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
        </div>
      </div>

      <div className="p-6 text-center">
        <div className="mx-auto h-64 w-64 rounded-[24px] border border-slate-200 bg-white p-3 shadow-inner">
          <FakeQRCode />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Mã vé</p>
          <p className="mt-1 font-mono text-sm font-black tracking-wider text-slate-950">{ticket.ticketCode}</p>
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
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="flex items-start gap-2 text-xs font-extrabold leading-5 text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Không chia sẻ mã QR cho người khác. Mỗi mã QR chỉ được điểm danh một lần.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onDownload}
            className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Tải vé
          </button>
          <button onClick={onPrint} className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700">
            <Printer className="h-4 w-4" />
            In vé
          </button>
        </div>
      </div>
    </div>
  );
}
