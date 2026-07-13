import { Bell, Menu, Search } from "lucide-react";
import { getCurrentUser } from "../../data/mockAuth";
import { getRoleLabel } from "../../utils/roleHelpers";

interface HeaderProps {
  onToggleSidebar?: () => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  title?: string;
  showWorkspaceTitle?: boolean;
}

export default function Header({
  onToggleSidebar,
  onToggleCollapse,
  collapsed = false,
  title,
  showWorkspaceTitle = true,
}: HeaderProps) {
  const currentUser = getCurrentUser();

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="btn-press grid h-10 w-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100 lg:hidden"
            aria-label="Mo menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Mo rong thanh ben" : "Thu gon thanh ben"}
            title={collapsed ? "Mo rong thanh ben" : "Thu gon thanh ben"}
            className="btn-press hidden h-10 w-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 lg:grid"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {showWorkspaceTitle && (
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:block">
              Khu vuc lam viec
            </p>
            <h2 className="truncate font-display text-lg font-semibold text-slate-950 sm:text-xl">
              {title || "Tong quan"}
            </h2>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser.role === "SUPER_ADMIN" && (
          <label className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm lg:flex">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
              placeholder="Tim kiem..."
              aria-label="Tim kiem nhanh"
            />
          </label>
        )}
        <button
          className="btn-press relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-brand-200 hover:text-brand-700"
          aria-label="Thong bao"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white/90 py-1 pl-1.5 pr-2.5 shadow-sm sm:flex">
          <img
            src="/src/assets/images/tvu_logo_1783065060265.jpg"
            alt="Anh dai dien"
            className="h-8 w-8 rounded-lg border border-slate-100 bg-white object-cover"
          />
          <div className="max-w-40">
            <p className="truncate text-xs font-semibold text-slate-950">{currentUser.fullName}</p>
            <p className="truncate text-[11px] font-medium text-slate-500">{getRoleLabel(currentUser.role)}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
