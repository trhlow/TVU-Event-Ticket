import React from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, RefreshCw, Search } from "lucide-react";
import { getCurrentUser, mockAuthAccounts, setCurrentUser } from "../../data/mockAuth";

interface HeaderProps {
  onToggleSidebar?: () => void;
  title?: string;
}

export default function Header({ onToggleSidebar, title }: HeaderProps) {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV;

  if (!currentUser) return null;

  const handleSwitchRole = (role: string) => {
    const targetUser = mockAuthAccounts[role];
    if (!targetUser) return;
    setCurrentUser(targetUser);
    navigate(role === "SUPER_ADMIN" ? "/admin/dashboard" : role === "ORGANIZER" ? "/organizer/dashboard" : "/student/home", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#C4C5D5] bg-[#FBF8FF] px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onToggleSidebar && (
          <button onClick={onToggleSidebar} className="grid h-10 w-10 place-items-center rounded-lg border border-[#C4C5D5] text-brand-700 md:hidden" aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h2 className="truncate font-display text-2xl font-extrabold text-brand-700">{title || "Dashboard Overview"}</h2>
      </div>

      <div className="flex items-center gap-4">
        {currentUser.role === "SUPER_ADMIN" && (
          <label className="hidden h-10 w-64 items-center gap-2 rounded-2xl border border-[#C4C5D5] bg-white px-4 lg:flex">
            <Search className="h-4 w-4 text-[#757684]" />
            <input className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#757684]" placeholder="Search..." />
          </label>
        )}
        {isDev && (
          <div className="hidden items-center gap-2 rounded-lg border border-[#C4C5D5] bg-white px-3 py-2 xl:flex">
            <RefreshCw className="h-3.5 w-3.5 text-brand-600" />
            <select value={currentUser.role} onChange={(event) => handleSwitchRole(event.target.value)} className="bg-transparent text-xs font-bold text-brand-700 outline-none">
              <option value="SINH_VIEN">Sinh viên</option>
              <option value="ORGANIZER">Ban tổ chức CLB</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
        )}
        <button className="relative grid h-10 w-10 place-items-center rounded-lg text-[#1A1B22]" aria-label="Thông báo">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-[#FBF8FF]" />
        </button>
        <img src="/src/assets/images/tvu_logo_1783065060265.jpg" alt="Ảnh đại diện" className="h-10 w-10 rounded-full border border-[#C4C5D5] bg-white object-cover" />
        <button
          onClick={() => {
            setCurrentUser(null);
            navigate("/login", { replace: true });
          }}
          className="grid h-10 w-10 place-items-center rounded-lg text-[#444653] hover:bg-rose-50 hover:text-rose-700"
          title="Đăng xuất"
          aria-label="Đăng xuất"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
