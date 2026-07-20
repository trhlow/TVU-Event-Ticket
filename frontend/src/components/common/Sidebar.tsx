import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Grid2X2,
  KeyRound,
  Layers,
  LogOut,
  Plus,
  QrCode,
  ScanLine,
  Settings,
  ShieldCheck,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { getCurrentUser } from "../../state/authSession";
import { authService } from "../../services/authService";

interface SidebarProps {
  onClose?: () => void;
  collapsed?: boolean;
}

export default function Sidebar({ onClose, collapsed = false }: SidebarProps) {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();

  if (!currentUser) return null;

  const navLinks =
    currentUser.role === "SINH_VIEN"
      ? [
          { to: "/student/home", label: "Tổng quan", icon: Grid2X2, end: true },
          { to: "/student/events", label: "Sự kiện", icon: Calendar },
          { to: "/student/tickets", label: "Vé QR của tôi", icon: Ticket },
          { to: "/student/registrations", label: "Đăng ký của tôi", icon: ClipboardList },
          { to: "/student/history", label: "Lịch sử tham gia", icon: FileClock },
          { to: "/student/notifications", label: "Thông báo", icon: Bell },
          { to: "/student/account", label: "Tài khoản", icon: User },
        ]
      : currentUser.role === "ORGANIZER"
        ? [
            { to: "/organizer/dashboard", label: "Tổng quan", icon: Grid2X2, end: true },
            { to: "/organizer/events", label: "Sự kiện CLB", icon: Calendar },
            { to: "/organizer/tickets", label: "Vé đã cấp", icon: Ticket },
            { to: "/organizer/members", label: "Thành viên", icon: Users },
            { to: "/organizer/reports", label: "Báo cáo CLB", icon: BarChart3 },
            { to: "/organizer/reservations", label: "Duyệt đăng ký", icon: ClipboardCheck },
            { to: "/organizer/registration-qr", label: "QR đăng ký", icon: QrCode },
            { to: "/organizer/check-in", label: "Quét QR điểm danh", icon: ScanLine },
            { to: "/organizer/notifications", label: "Thông báo", icon: Bell },
          ]
        : [
            { to: "/admin/dashboard", label: "Tổng quan", icon: Grid2X2, end: true },
            { to: "/admin/events", label: "Sự kiện toàn trường", icon: Calendar },
            { to: "/admin/accounts", label: "Tài khoản BTC", icon: Users },
            { to: "/admin/clubs", label: "Câu lạc bộ", icon: Layers },
            { to: "/admin/users", label: "Người dùng", icon: User },
            { to: "/admin/statistics", label: "Thống kê", icon: BarChart3 },
            { to: "/admin/roles", label: "Phân quyền RBAC", icon: ShieldCheck, section: "SUPER ADMIN" },
            { to: "/admin/audit-logs", label: "Nhật ký hệ thống", icon: KeyRound },
            { to: "/admin/notifications", label: "Thông báo", icon: Bell },
          ];

  const settingsPath =
    currentUser.role === "SINH_VIEN"
      ? "/student/account"
      : currentUser.role === "ORGANIZER"
        ? "/organizer/profile"
        : "/admin/profile";

  return (
    <aside className="flex h-screen w-full flex-col overflow-hidden border-r border-blue-100 bg-white/94 text-slate-600 shadow-[10px_0_32px_rgba(30,64,175,0.08)] backdrop-blur-xl transition-all duration-300">
      <div className={`flex h-16 shrink-0 items-center border-b border-blue-50 bg-white/96 transition-all duration-300 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <div className={`flex min-w-0 items-center transition-all duration-200 ${collapsed ? "w-full justify-center gap-0" : "gap-2.5"}`}>
          <img
            src="/tvu_logo_1783065060265.jpg"
            alt="TVU Logo"
            className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-sm shadow-blue-950/[0.04] ring-1 ring-blue-100"
          />
          <div className={`min-w-0 transition-all duration-200 ${collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"}`}>
            <p className="truncate font-display text-lg font-extrabold leading-none text-brand-800">TVU Event</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">Ticketing Platform</p>
          </div>
        </div>
      </div>

      {currentUser.role === "ORGANIZER" && (
        <div className={`px-4 py-3 transition-all duration-300 ${collapsed ? "flex justify-center px-0" : ""}`}>
          <NavLink
            to="/organizer/events/create"
            onClick={onClose}
            title="Tạo sự kiện"
            className={`btn-press flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-brand-700 to-accent-600 text-sm font-bold text-white shadow-md shadow-blue-700/20 transition hover:from-brand-600 hover:to-accent-500 ${
              collapsed ? "w-10 px-0" : "w-full gap-2.5 px-3"
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate text-sm font-bold leading-none">Tạo sự kiện</span>}
          </NavLink>
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto py-3 transition-all duration-300 ${collapsed ? "px-5" : "px-4"}`} aria-label="Điều hướng chính">
        <div className="space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <React.Fragment key={link.to + link.label}>
                {"section" in link && link.section && !collapsed && (
                  <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-wider text-blue-400">{link.section}</p>
                )}
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={onClose}
                  title={collapsed ? link.label : undefined}
                  className={({ isActive }) =>
                    [
                      "group relative flex h-11 items-center rounded-xl text-sm font-semibold transition-all duration-200",
                      collapsed ? "mx-auto w-11 justify-center px-0" : "gap-2.5 px-3",
                      isActive
                        ? "bg-blue-50 text-brand-800 ring-1 ring-blue-100 shadow-sm shadow-blue-950/[0.03]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    ].join(" ")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0 transition group-hover:scale-105" />
                  {!collapsed && <span className="truncate text-sm font-semibold leading-none">{link.label}</span>}
                </NavLink>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      <div className={`border-t border-blue-50 p-4 transition-all duration-300 ${collapsed ? "px-5" : ""}`}>
        <NavLink
          to={settingsPath}
          onClick={onClose}
          title={collapsed ? "Cài đặt" : undefined}
          className={`btn-press flex h-11 items-center rounded-xl text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-brand-800 ${collapsed ? "mx-auto w-11 justify-center px-0" : "gap-2.5 px-3"}`}
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate text-sm font-semibold leading-none">Cài đặt</span>}
        </NavLink>
        <button
          onClick={async () => {
            await authService.logout();
            navigate("/login", { replace: true });
          }}
          title={collapsed ? "Đăng xuất" : undefined}
          className={`btn-press mt-1.5 flex h-11 w-full items-center rounded-xl text-left text-sm font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 ${collapsed ? "mx-auto w-11 justify-center px-0" : "gap-2.5 px-3"}`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate text-sm font-semibold leading-none">Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
}
