import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/common/ToastProvider";
import { formatDateTime } from "../../utils/formatDate";
import { ticketService } from "../../services/ticketService";
import { apiRequest } from "../../services/apiClient";
import { Ticket } from "../../types/ticket";

const PAGE_SIZE = 20;

export default function AttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { showToast } = useToast();
  const [attendees, setAttendees] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "VALID" | "CHECKED_IN" | "CANCELLED">("ALL");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(0);
      setKeyword(search.trim());
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;
    setIsLoading(true);
    ticketService
      .listAttendeesPage(eventId, {
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      })
      .then((result) => {
        if (!mounted) return;
        setAttendees(result.items);
        setTotalPages(result.totalPages);
        setTotalElements(result.totalElements);
      })
      .catch((error) => {
        if (mounted) showToast(error instanceof Error ? error.message : "Không thể tải danh sách tham dự.", "error");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [eventId, keyword, page, statusFilter, showToast]);

  const handleExportCSV = async () => {
    if (!eventId) {
      showToast("Vui lòng chọn sự kiện trước khi xuất CSV.", "error");
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
      showToast(error instanceof Error ? error.message : "Không thể xuất CSV.", "error");
    }
  };

  const columns = [
    { header: "Vé", accessor: (ticket: Ticket) => <span className="font-mono text-xs font-bold text-slate-900">{ticket.ticketCode}</span> },
    { header: "Student ID", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentId}</span> },
    { header: "MSSV", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentMssv || "-"}</span> },
    { header: "Email", accessor: (ticket: Ticket) => <span className="text-xs font-bold text-slate-700">{ticket.studentEmail || "-"}</span> },
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
        title="Danh sách sinh viên tham dự"
        description="Đọc attendee JSON từ backend theo sự kiện và phạm vi CLB trong JWT, phân trang và lọc phía server."
        actions={
          <Button onClick={handleExportCSV}>
            <Download className="h-4 w-4" aria-hidden="true" /> Xuất CSV
          </Button>
        }
      />

      <div className="enterprise-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tìm kiếm</span>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email hoặc MSSV sinh viên..." className="pl-9" />
          </div>
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Trạng thái vé</span>
          <select
            value={statusFilter}
            onChange={(event) => {
              setPage(0);
              setStatusFilter(event.target.value as typeof statusFilter);
            }}
            className="tvu-input"
          >
            <option value="ALL">Tất cả</option>
            <option value="VALID">Còn hiệu lực</option>
            <option value="CHECKED_IN">Đã check-in</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </label>
      </div>

      <div className="enterprise-card overflow-hidden">
        <table className="w-full text-left text-xs font-semibold text-slate-600">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {columns.map((column) => (
                <th key={column.header} className="px-4 py-2.5">{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-9 text-center text-sm font-semibold text-slate-400">Đang tải...</td>
              </tr>
            ) : attendees.length > 0 ? (
              attendees.map((ticket) => (
                <tr key={ticket.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  {columns.map((column) => (
                    <td key={column.header} className="px-4 py-3">{column.accessor(ticket)}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-9 text-center text-sm font-semibold text-slate-400">Không tìm thấy người tham dự phù hợp</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Trang <span className="text-slate-950">{page + 1}</span> / {totalPages} · Tổng số{" "}
            <span className="text-slate-950">{totalElements}</span> người tham dự
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              disabled={page === 0}
              className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
              disabled={page >= totalPages - 1}
              className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Trang sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
