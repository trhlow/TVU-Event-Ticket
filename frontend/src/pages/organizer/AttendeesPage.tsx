import React, { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useParams } from "react-router-dom";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import { ticketService } from "../../services/ticketService";
import { apiRequest } from "../../services/apiClient";
import { Ticket } from "../../types/ticket";

export default function AttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [attendees, setAttendees] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    ticketService.listAttendees(eventId)
      .then((items) => {
        if (mounted) setAttendees(items);
      })
      .catch((error) => {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Khong the tai danh sach tham du.");
      });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const filteredAttendees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return attendees;
    return attendees.filter((ticket) => `${ticket.ticketCode} ${ticket.studentId}`.toLowerCase().includes(normalized));
  }, [attendees, search]);

  const handleExportCSV = async () => {
    if (!eventId) {
      setToastMsg("Vui long chon su kien truoc khi xuat CSV.");
      return;
    }
    try {
      const csv = await apiRequest<string>(`/ticketing/events/${eventId}/attendees.csv`);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendees-${eventId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Khong the xuat CSV.");
    }
  };

  const columns = [
    { header: "Ticket", accessor: (ticket: Ticket) => <span className="font-mono text-xs font-bold text-gray-900">{ticket.ticketCode}</span> },
    { header: "Student ID", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-gray-700">{ticket.studentId}</span> },
    { header: "Event", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-gray-700">{ticket.eventId}</span> },
    {
      header: "Check-in",
      accessor: (ticket: Ticket) => (
        <div className="text-left">
          {ticket.checkInStatus === "CHECKED_IN" ? (
            <div>
              <span className="block w-fit rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">CHECKED_IN</span>
              <span className="mt-0.5 block text-[9px] font-semibold text-gray-400">{ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : ""}</span>
            </div>
          ) : (
            <span className="block w-fit rounded bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">PENDING</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Nguoi tham du" }]} />

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-gray-950">Danh sach sinh vien tham du</h2>
          <p className="text-xs font-semibold text-gray-500">Doc attendee JSON tu backend theo event va club scope cua JWT.</p>
        </div>
        <button onClick={handleExportCSV} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-600/10 transition-all hover:bg-brand-700">
          <Download className="h-4 w-4" /> Xuat CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400">Tim kiem</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ticket, student ID..." className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs font-semibold focus:border-brand-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500" />
          </div>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
        <DataTable data={filteredAttendees} columns={columns} searchPlaceholder="Loc nhanh..." searchField="ticketCode" />
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
