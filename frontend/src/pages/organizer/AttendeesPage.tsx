import React, { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { useParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import Toast from "../../components/common/Toast";
import { formatDateTime } from "../../utils/formatDate";
import { ticketService } from "../../services/ticketService";
import { apiRequest } from "../../services/apiClient";
import { Ticket } from "../../types/ticket";

export default function AttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [attendees, setAttendees] = useState<Ticket[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    ticketService.listAttendees(eventId, debouncedSearch)
      .then((page) => {
        if (mounted) {
          setAttendees(page.tickets);
          setTotalElements(page.totalElements);
        }
      })
      .catch((error) => {
        if (mounted) setToastMsg(error instanceof Error ? error.message : "Không thể tải danh sách tham dự.");
      });
    return () => {
      mounted = false;
    };
  }, [eventId, debouncedSearch]);

  const handleExportCSV = async () => {
    if (!eventId) {
      setToastMsg("Vui lòng chọn sự kiện trước khi xuất CSV.");
      return;
    }
    try {
      const query = search.trim() ? `?keyword=${encodeURIComponent(search.trim())}` : "";
      const csv = await apiRequest<string>(`/ticketing/events/${eventId}/attendees.csv${query}`);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendees-${eventId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : "Không thể xuất CSV.");
    }
  };

  const columns = [
    { header: "Vé", accessor: (ticket: Ticket) => <span className="font-mono text-xs font-bold text-slate-900">{ticket.ticketCode}</span> },
    { header: "Student ID", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentId}</span> },
    { header: "MSSV", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentMssv || "-"}</span> },
    { header: "Email", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentEmail || "-"}</span> },
    { header: "Sự kiện", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.eventId}</span> },
    {
      header: "Check-in",
      accessor: (ticket: Ticket) => (
        <div className="text-left">
          {ticket.checkInStatus === "CHECKED_IN" ? (
            <div>
              <span className="block w-fit rounded bg-success-50 px-2 py-0.5 text-[10px] font-extrabold text-success-700">Đã check-in</span>
              <span className="mt-0.5 block text-[9px] font-semibold text-slate-400">{ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : ""}</span>
            </div>
          ) : (
            <span className="block w-fit rounded bg-warning-50 px-2 py-0.5 text-[10px] font-extrabold text-warning-700">Chưa check-in</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Ban tổ chức", path: "/organizer" }, { label: "Người tham dự" }]}
        title="Danh sách sinh viên tham dự"
        description="Đọc attendee JSON từ backend theo sự kiện và phạm vi CLB trong JWT."
        actions={
          <button onClick={handleExportCSV} className="btn-press flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-600/10 hover:bg-brand-700">
            <Download className="h-4 w-4" aria-hidden="true" /> Xuất CSV
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tìm kiếm</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, MSSV..." className="tvu-input pl-9" />
          </div>
        </label>
      </div>

      {totalElements > attendees.length && (
        <p className="rounded-xl bg-warning-50 px-4 py-2 text-xs font-bold text-warning-700">
          Hiển thị {attendees.length} trong tổng số {totalElements}. Dùng ô tìm kiếm để thu hẹp hoặc xuất CSV để xem đầy đủ.
        </p>
      )}

      <div className="enterprise-card overflow-hidden p-1">
        <DataTable data={attendees} columns={columns} searchPlaceholder="Lọc nhanh..." searchField="ticketCode" />
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
