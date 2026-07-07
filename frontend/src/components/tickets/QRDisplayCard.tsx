import React from "react";
import { Download, Printer, ShieldCheck } from "lucide-react";
import { Event } from "../../types/event";
import { Ticket } from "../../types/ticket";
import StatusBadge from "../common/StatusBadge";

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
    <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border border-[#C4C5D5] bg-white shadow-[0_1px_2px_rgba(26,27,34,0.05)]">
      <div className="bg-[#F4F2FC] p-6 text-left">
        <StatusBadge type="ticket" status={ticket.status} checkInStatus={ticket.checkInStatus} />
        <h3 className="mt-4 font-display text-xl font-extrabold leading-snug text-[#1A1B22]">{event.title}</h3>
        <p className="mt-2 text-sm font-semibold text-[#444653]">{event.clubName}</p>
      </div>

      <div className="p-6 text-center">
        <div className="mx-auto h-64 w-64 rounded-xl border border-[#C4C5D5] bg-white p-4 shadow-inner">
          <FakeQRCode />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Mã vé</p>
          <p className="mt-1 font-mono text-sm font-black tracking-wider text-slate-950">{ticket.ticketCode}</p>
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Tải vé
          </button>
          <button onClick={onPrint} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-extrabold text-white hover:bg-brand-700">
            <Printer className="h-4 w-4" />
            In vé
          </button>
        </div>
      </div>
    </div>
  );
}
