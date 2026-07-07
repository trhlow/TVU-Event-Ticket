import React from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { getCurrentUser } from "../../data/mockAuth";
import { authService } from "../../services/authService";
import { getRoleLabel } from "../../utils/roleHelpers";

interface HeaderProps {
  onToggleSidebar?: () => void;
  title?: string;
}

export default function Header({ onToggleSidebar, title }: HeaderProps) {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between border-b border-white/70 bg-white/78 px-4 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="btn-press grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-brand-700 shadow-sm md:hidden"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <p className="hidden text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400 sm:block">
            TVU Event & Ticketing
          </p>
          <h2 className="truncate font-display text-xl font-extrabold text-slate-950 sm:text-2xl">
            {title || "Tổng quan"}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser.role === "SUPER_ADMIN" && (
          <label className="hidden h-11 w-72 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 shadow-sm lg:flex">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              placeholder="Tìm kiếm..."
              aria-label="Tìm kiếm nhanh"
            />
          </label>
        )}
        <button
          className="btn-press relative grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-200 hover:text-brand-700"
          aria-label="Thông báo"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 py-1.5 pl-2 pr-3 shadow-sm sm:flex">
          <img
            src="/src/assets/images/tvu_logo_1783065060265.jpg"
            alt="Ảnh đại diện"
            className="h-9 w-9 rounded-xl border border-slate-100 bg-white object-cover"
          />
          <div className="max-w-40">
            <p className="truncate text-xs font-extrabold text-slate-950">{currentUser.fullName}</p>
            <p className="truncate text-[11px] font-bold text-slate-500">{getRoleLabel(currentUser.role)}</p>
          </div>
        </div>
        <button
          onClick={() => {
            void authService.logout();
            navigate("/login", { replace: true });
          }}
          className="btn-press grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          title="Đăng xuất"
          aria-label="Đăng xuất"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
