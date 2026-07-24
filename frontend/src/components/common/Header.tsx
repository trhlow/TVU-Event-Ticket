import { Bell, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "../../state/authSession";
import { getRoleLabel } from "../../utils/roleHelpers";
import NotificationsPanel from "./NotificationsPanel";
import { NotificationScope } from "../../pages/common/NotificationsPage";

const notificationScopeByRole: Record<string, NotificationScope> = {
  SINH_VIEN: "student",
  ORGANIZER: "organizer",
  SUPER_ADMIN: "admin",
};

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-blue-100/70 bg-white/86 px-4 shadow-sm backdrop-blur-xl sm:px-5 lg:px-6">
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
        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            className="btn-press grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-white text-slate-700 shadow-sm hover:border-brand-200 hover:bg-blue-50 hover:text-brand-700"
            aria-label="Thông báo"
          >
            <Bell className="h-5 w-5" />
          </button>
          {notificationsOpen && (
            <NotificationsPanel
              scope={notificationScopeByRole[currentUser.role] || "student"}
              onClose={() => setNotificationsOpen(false)}
            />
          )}
        </div>
        <div className="hidden items-center gap-2 rounded-xl border border-blue-100 bg-white/92 py-1 pl-1.5 pr-2.5 shadow-sm sm:flex">
          <img
            src="/tvu_logo_1783065060265.jpg"
            alt=""
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
