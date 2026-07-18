import React, { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/common/ToastProvider";
import { formatDateTime } from "../../utils/formatDate";
import { ticketService } from "../../services/ticketService";
import { apiRequest } from "../../services/apiClient";
import { Ticket } from "../../types/ticket";

export default function AttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { showToast } = useToast();
  const [attendees, setAttendees] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    ticketService.listAttendees(eventId)
      .then((items) => {
        if (mounted) setAttendees(items);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải danh sách tham dự.", "error");
      });
    return () => {
      mounted = false;
    };
  }, [eventId, showToast]);

  const filteredAttendees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return attendees;
    return attendees.filter((ticket) => `${ticket.ticketCode} ${ticket.studentId}`.toLowerCase().includes(normalized));
  }, [attendees, search]);

  const handleExportCSV = async () => {
    if (!eventId) {
      showToast("Vui lòng chọn sự kiện trước khi xuất CSV.", "error");
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
      showToast(error instanceof Error ? error.message : "Không thể xuất CSV.", "error");
    }
  };

  const columns = [
    { header: "Vé", accessor: (ticket: Ticket) => <span className="font-mono text-xs font-bold text-slate-900">{ticket.ticketCode}</span> },
    { header: "Student ID", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentId}</span> },
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
          <Button onClick={handleExportCSV}>
            <Download className="h-4 w-4" aria-hidden="true" /> Xuất CSV
          </Button>
        }
      />

      <div className="enterprise-card grid grid-cols-1 gap-4 p-4">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tìm kiếm</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vé, student ID..." className="pl-9" />
          </div>
        </label>
      </div>

      <div className="enterprise-card overflow-hidden p-1">
        <DataTable data={filteredAttendees} columns={columns} searchPlaceholder="Lọc nhanh..." searchField="ticketCode" />
      </div>
    </div>
  );
}
