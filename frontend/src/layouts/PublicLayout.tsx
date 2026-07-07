import React from "react";
import { Link, Outlet } from "react-router-dom";
import { Bell } from "lucide-react";

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF8FF] font-sans">
      <nav className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[#E3E1EB] bg-[#FBF8FF]/95 px-6 backdrop-blur md:px-8">
        <Link to="/" className="font-display text-2xl font-extrabold tracking-tight text-brand-700">
          TVU Ticket
        </Link>
        <div className="flex items-center gap-8">
          <Link to="/" className="hidden border-b-2 border-brand-600 px-2 py-5 text-sm font-bold text-brand-700 sm:block">
            Trang chủ
          </Link>
          <Link to="/student/events" className="hidden px-2 py-5 text-sm font-semibold text-[#444653] hover:text-brand-700 sm:block">
            Sự kiện
          </Link>
          <a href="#features" className="hidden px-2 py-5 text-sm font-semibold text-[#444653] hover:text-brand-700 sm:block">
            Hướng dẫn
          </a>
          <Bell className="hidden h-5 w-5 text-[#1A1B22] sm:block" />
          <Link to="/login" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-brand-700">
            Đăng nhập
          </Link>
        </div>
      </nav>

      <main className="flex w-full flex-1 flex-col">
        <Outlet />
      </main>

      <footer className="border-t border-[#E3E1EB] bg-[#FBF8FF] px-6 py-6 text-center text-xs font-semibold text-[#757684]">
        © 2026 Trường Đại học Trà Vinh. Tất cả quyền được bảo lưu.
      </footer>
    </div>
  );
}
