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
import { getCurrentUser, mockAuthAccounts, setCurrentUser } from "../../data/mockAuth";
import { getRoleLabel } from "../../utils/roleHelpers";

type AppRole = "SINH_VIEN" | "ORGANIZER" | "SUPER_ADMIN";

interface SidebarProps {
  onClose?: () => void;
}

const roleHome: Record<AppRole, string> = {
  SINH_VIEN: "/student/home",
  ORGANIZER: "/organizer/dashboard",
  SUPER_ADMIN: "/admin/dashboard",
};

export default function Sidebar({ onClose }: SidebarProps) {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV;

  if (!currentUser) return null;

  const handleSwitchRole = (role: AppRole) => {
    setCurrentUser(mockAuthAccounts[role]);
    onClose?.();
    navigate(roleHome[role], { replace: true });
  };

  const navLinks =
    currentUser.role === "SINH_VIEN"
      ? [
          { to: "/student/home", label: "Dashboard", icon: Grid2X2, end: true },
          { to: "/student/events", label: "Events", icon: Calendar },
          { to: "/student/tickets", label: "My Tickets", icon: Ticket },
          { to: "/student/registrations", label: "Đăng ký của tôi", icon: ClipboardList },
          { to: "/student/history", label: "Lịch sử tham gia", icon: FileClock },
          { to: "/notifications", label: "Thông báo", icon: Bell },
          { to: "/account/settings", label: "Tài khoản", icon: User },
        ]
      : currentUser.role === "ORGANIZER"
        ? [
            { to: "/organizer/dashboard", label: "Dashboard", icon: Grid2X2, end: true },
            { to: "/organizer/events", label: "Events", icon: Calendar },
            { to: "/organizer/tickets", label: "My Tickets", icon: Ticket },
            { to: "/organizer/members", label: "Clubs", icon: Users },
            { to: "/organizer/attendees", label: "Members", icon: User },
            { to: "/organizer/reports", label: "Reports", icon: BarChart3 },
            { to: "/organizer/reservations", label: "Duyệt đăng ký", icon: ClipboardCheck },
            { to: "/organizer/registration-qr", label: "QR đăng ký", icon: QrCode },
            { to: "/organizer/check-in", label: "Quét QR", icon: ScanLine },
          ]
        : [
            { to: "/admin/dashboard", label: "Dashboard", icon: Grid2X2, end: true },
            { to: "/admin/events", label: "Events", icon: Calendar },
            { to: "/admin/accounts", label: "My Tickets", icon: Ticket },
            { to: "/admin/clubs", label: "Clubs", icon: Layers },
            { to: "/admin/users", label: "Members", icon: Users },
            { to: "/admin/statistics", label: "Reports", icon: BarChart3 },
            { to: "/admin/roles", label: "RBAC Matrix", icon: ShieldCheck, section: "SUPER ADMIN" },
            { to: "/admin/audit-logs", label: "Nhật ký hệ thống", icon: KeyRound },
          ];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[258px] flex-col border-r border-[#C4C5D5] bg-[#F4F2FC] text-[#444653]">
      <div className="flex h-[96px] items-center gap-3 px-6">
        <img src="/src/assets/images/tvu_logo_1783065060265.jpg" alt="TVU Logo" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
        <div>
          <p className="font-display text-2xl font-extrabold leading-none text-brand-700">TVU Event</p>
          <p className="mt-1 text-sm font-medium text-[#444653]">Management Portal</p>
        </div>
      </div>

      {currentUser.role === "ORGANIZER" && (
        <div className="px-[18px] pb-8">
          <NavLink
            to="/organizer/events/create"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-brand-700 text-base font-extrabold text-white shadow-sm transition hover:bg-brand-600"
          >
            <Plus className="h-5 w-5" />
            Create Event
          </NavLink>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-[18px]">
        <div className="space-y-3">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <React.Fragment key={link.to + link.label}>
                {"section" in link && link.section && (
                  <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wider text-[#757684]">{link.section}</p>
                )}
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    [
                      "flex min-h-[42px] items-center gap-3 rounded-lg px-4 text-sm font-semibold transition",
                      isActive ? "bg-[#2170E4] text-white" : "text-[#444653] hover:bg-white hover:text-brand-700",
                    ].join(" ")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{link.label}</span>
                </NavLink>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-[#C4C5D5] p-[18px]">
        {isDev && (
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-white/60 p-1">
            {(["SINH_VIEN", "ORGANIZER", "SUPER_ADMIN"] as const).map((role) => (
              <button
                key={role}
                onClick={() => handleSwitchRole(role)}
                className={`rounded-md px-2 py-1.5 text-[10px] font-black ${
                  currentUser.role === role ? "bg-brand-700 text-white" : "text-[#444653]"
                }`}
              >
                {role === "SINH_VIEN" ? "SV" : role === "ORGANIZER" ? "BTC" : "ADMIN"}
              </button>
            ))}
          </div>
        )}
        <NavLink to="/account/settings" className="flex min-h-[42px] items-center gap-3 rounded-lg px-4 text-sm font-semibold text-[#444653] hover:bg-white">
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>
        <button
          onClick={() => {
            setCurrentUser(null);
            navigate("/login");
          }}
          className="mt-2 flex min-h-[42px] w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-semibold text-[#444653] hover:bg-white hover:text-rose-700"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
        <p className="mt-3 text-center text-[10px] font-semibold text-[#757684]">{getRoleLabel(currentUser.role)}</p>
      </div>
    </aside>
  );
}
