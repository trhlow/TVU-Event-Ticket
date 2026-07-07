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
import { getCurrentUser } from "../../data/mockAuth";
import { authService } from "../../services/authService";
import { getRoleLabel } from "../../utils/roleHelpers";

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
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
            { to: "/organizer/check-in", label: "Quét QR", icon: ScanLine },
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
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[258px] flex-col border-r border-white/70 bg-[#eef2ff]/88 text-slate-600 shadow-[12px_0_35px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex h-[96px] items-center gap-3 px-6">
        <img
          src="/src/assets/images/tvu_logo_1783065060265.jpg"
          alt="TVU Logo"
          className="h-11 w-11 rounded-2xl bg-white object-contain p-1.5 shadow-sm"
        />
        <div>
          <p className="font-display text-2xl font-extrabold leading-none text-brand-800">TVU Event</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Ticketing Platform</p>
        </div>
      </div>

      {currentUser.role === "ORGANIZER" && (
        <div className="px-[18px] pb-6">
          <NavLink
            to="/organizer/events/create"
            onClick={onClose}
            className="btn-press flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-800 to-brand-600 text-base font-extrabold text-white shadow-lg shadow-brand-700/20 transition hover:shadow-xl hover:shadow-brand-700/25"
          >
            <Plus className="h-5 w-5" />
            Tạo sự kiện
          </NavLink>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-[18px] pb-3" aria-label="Điều hướng chính">
        <div className="space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <React.Fragment key={link.to + link.label}>
                {"section" in link && link.section && (
                  <p className="px-4 pt-4 text-xs font-black uppercase tracking-wider text-slate-400">{link.section}</p>
                )}
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [
                      "group flex min-h-[44px] items-center gap-3 rounded-2xl px-4 text-sm font-bold transition-all duration-200",
                      isActive
                        ? "bg-brand-700 text-white shadow-lg shadow-brand-700/18"
                        : "text-slate-600 hover:bg-white/86 hover:text-brand-800 hover:shadow-sm",
                    ].join(" ")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                  <span className="truncate">{link.label}</span>
                </NavLink>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/70 p-[18px]">
        <div className="mb-3 rounded-2xl border border-white/70 bg-white/70 p-3">
          <p className="truncate text-xs font-extrabold text-slate-950">{currentUser.fullName}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">{getRoleLabel(currentUser.role)}</p>
        </div>
        <NavLink
          to={settingsPath}
          onClick={onClose}
          className="btn-press flex min-h-[42px] items-center gap-3 rounded-2xl px-4 text-sm font-bold text-slate-600 hover:bg-white hover:text-brand-800"
        >
          <Settings className="h-5 w-5" />
          Cài đặt
        </NavLink>
        <button
          onClick={() => {
            void authService.logout();
            navigate("/login");
          }}
          className="btn-press mt-2 flex min-h-[42px] w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-5 w-5" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
