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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-blue-100/70 bg-white/86 px-4 shadow-sm shadow-blue-950/[0.04] backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="btn-press grid h-10 w-10 place-items-center rounded-xl border border-transparent text-slate-700 transition hover:border-blue-100 hover:bg-blue-50 hover:text-brand-700 lg:hidden"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            className="btn-press hidden h-10 w-10 place-items-center rounded-xl border border-transparent text-slate-700 transition hover:border-blue-100 hover:bg-blue-50 hover:text-brand-700 active:bg-blue-100 lg:grid"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {showWorkspaceTitle && (
          <div className="min-w-0">
            <p className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-blue-500/80 sm:block">
              Khu vực làm việc
            </p>
            <h2 className="truncate font-display text-lg font-extrabold text-slate-950 sm:text-xl">
              {title || "Tổng quan"}
            </h2>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser.role === "SUPER_ADMIN" && (
          <label className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-blue-100 bg-white/92 px-3 shadow-sm shadow-blue-950/[0.03] transition focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-blue-100 lg:flex">
            <Search className="h-4 w-4 text-blue-500" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="Tìm kiếm..."
              aria-label="Tìm kiếm nhanh"
            />
          </label>
        )}
        <button
          className="btn-press relative grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-white text-slate-700 shadow-sm shadow-blue-950/[0.03] hover:border-brand-200 hover:bg-blue-50 hover:text-brand-700"
          aria-label="Thông báo"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <div className="hidden items-center gap-2 rounded-xl border border-blue-100 bg-white/92 py-1 pl-1.5 pr-2.5 shadow-sm shadow-blue-950/[0.03] sm:flex">
          <img
            src="/src/assets/images/tvu_logo_1783065060265.jpg"
            alt="Ảnh đại diện"
            className="h-8 w-8 rounded-lg border border-blue-50 bg-white object-cover"
          />
          <div className="max-w-40">
            <p className="truncate text-xs font-bold text-slate-950">{currentUser.fullName}</p>
            <p className="truncate text-[11px] font-semibold text-slate-500">{getRoleLabel(currentUser.role)}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
