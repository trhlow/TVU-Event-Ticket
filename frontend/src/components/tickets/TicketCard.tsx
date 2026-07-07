import React from "react";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";
import { Calendar, MapPin, QrCode, ClipboardCheck } from "lucide-react";
import StatusBadge from "../common/StatusBadge";
import { formatDateTime } from "../../utils/formatDate";

interface TicketCardProps {
  key?: React.Key;
  ticket: Ticket;
  event: Event;
  onViewQR: (ticketId: string) => void;
}

export default function TicketCard({ ticket, event, onViewQR }: TicketCardProps) {
  const isCheckedIn = ticket.checkInStatus === "CHECKED_IN";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col md:flex-row text-left">
      {/* Decorative Stub Section */}
      <div
        className={`p-5 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-dashed border-gray-200 ${
          isCheckedIn ? "bg-emerald-50/20" : "bg-brand-50/10"
        } w-full md:w-44 flex-shrink-0`}
      >
        <div
          className={`p-3 rounded-full mb-2 ${
            isCheckedIn
              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
              : "bg-brand-50 text-brand-600 border border-brand-100"
          }`}
        >
          <QrCode className="w-6 h-6" />
        </div>
        <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block">
          Mã vé của bạn
        </span>
        <span className="text-xs font-black text-gray-900 mt-1 block font-mono">
          {ticket.ticketCode}
        </span>
        <div className="mt-3">
          <StatusBadge
            type="ticket"
            status={ticket.status}
            checkInStatus={ticket.checkInStatus}
          />
        </div>
      </div>

      {/* Ticket Details Section */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div className="space-y-2.5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-[9px] text-brand-600 font-black uppercase tracking-wider block">
                {event.clubName}
              </span>
              <h4 className="text-sm font-extrabold text-gray-950 tracking-tight mt-1 line-clamp-1 leading-snug">
                {event.title}
              </h4>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-500 font-semibold pt-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{formatDateTime(event.startAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <span className="truncate">{event.location}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[9px] text-gray-400 font-bold uppercase leading-none block">
              Cấp ngày
            </span>
            <span className="text-[10px] text-gray-600 font-bold block mt-1">
              {formatDateTime(ticket.issuedAt)}
            </span>
          </div>

          {isCheckedIn ? (
            <span className="text-[11px] text-emerald-600 font-extrabold flex items-center gap-1">
              <ClipboardCheck className="w-4 h-4" /> Đã điểm danh
            </span>
          ) : (
            <button
              onClick={() => onViewQR(ticket.id)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              Hiển thị QR vé
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
