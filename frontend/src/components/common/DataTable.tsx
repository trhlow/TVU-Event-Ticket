import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

interface Column<T> {
  header: string;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchField?: keyof T | ((row: T) => string);
  filterConfig?: {
    label: string;
    field: keyof T;
    options: { label: string; value: string }[];
  };
  pageSize?: number;
  id?: string;
  renderMobileCard?: (row: T) => React.ReactNode;
}

export default function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Tìm kiếm...",
  searchField,
  filterConfig,
  pageSize = 5,
  id = "data-table",
  renderMobileCard,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterValue, setFilterValue] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    let result = data;

    if (filterConfig && filterValue !== "ALL") {
      result = result.filter((row) => String(row[filterConfig.field]) === filterValue);
    }

    if (searchTerm.trim() && searchField) {
      const normalizedSearch = searchTerm.toLowerCase().trim();
      result = result.filter((row) => {
        const value = typeof searchField === "function" ? searchField(row) : String(row[searchField] || "");
        return value.toLowerCase().includes(normalizedSearch);
      });
    }

    return result;
  }, [data, searchTerm, filterValue, searchField, filterConfig]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterValue]);

  return (
    <div className="enterprise-card overflow-hidden text-left" id={id}>
      <div className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-r from-white via-blue-50/70 to-cyan-50/70 p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="tvu-input pl-10"
            aria-label={searchPlaceholder}
          />
        </div>

        {filterConfig && (
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{filterConfig.label}</span>
            <select
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              className="tvu-input w-auto py-2"
              aria-label={filterConfig.label}
            >
              <option value="ALL">Tất cả</option>
              {filterConfig.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-blue-100 bg-slate-50/90 hover:bg-slate-50/90">
              {columns.map((column) => (
                <TableHead
                  key={column.header}
                  className={column.className || ""}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100 bg-white/80">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column) => (
                    <TableCell key={column.header} className={column.className || ""}>
                      {column.accessor(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="px-4 py-9 text-center text-sm font-semibold text-slate-400">
                  Không tìm thấy kết quả phù hợp
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 bg-slate-50/70 p-4 md:hidden">
        {paginatedData.length > 0 ? (
          paginatedData.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {renderMobileCard ? (
                renderMobileCard(row)
              ) : (
                <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  {columns.map((column) => (
                    <div key={column.header} className="border-b border-slate-100 py-2 last:border-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{column.header}</p>
                      <div className="mt-1 text-sm font-medium text-slate-700">{column.accessor(row)}</div>
                    </div>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))
        ) : (
          <div className="rounded-xl border border-blue-100 bg-white p-5 text-center text-sm font-semibold text-slate-400">
            Không tìm thấy kết quả phù hợp
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-blue-100 bg-white/92 p-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Hiển thị {filteredData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} đến{" "}
          {Math.min(currentPage * pageSize, filteredData.length)} trong tổng số{" "}
          <span className="text-slate-950">{filteredData.length}</span> kết quả
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            disabled={currentPage === 1}
            className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-blue-100 bg-white text-slate-700 hover:bg-blue-50 disabled:opacity-40"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            Trang <span className="text-slate-950">{currentPage}</span> / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="btn-press grid h-9 w-9 place-items-center rounded-xl border border-blue-100 bg-white text-slate-700 hover:bg-blue-50 disabled:opacity-40"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
