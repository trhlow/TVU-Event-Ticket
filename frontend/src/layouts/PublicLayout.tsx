import React, { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, Menu, X } from "lucide-react";

const navItems = [
  { label: "Trang chủ", to: "/" },
  { label: "Sự kiện", to: "/events" },
  { label: "Hướng dẫn", to: "/guide" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "relative py-6 text-sm font-bold transition-colors hover:text-brand-700",
    isActive
      ? "text-brand-800 after:absolute after:bottom-4 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-brand-600"
      : "text-slate-600",
  ].join(" ");
}

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-transparent font-sans">
      <nav className="sticky top-0 z-50 border-b border-white/70 bg-white/82 px-4 shadow-sm shadow-slate-900/5 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="relative mx-auto grid h-18 max-w-[1180px] grid-cols-[1fr_auto_1fr] items-center">
          <Link to="/" className="justify-self-start font-display text-2xl font-extrabold tracking-tight text-brand-800">
            TVU Ticket
          </Link>

          <div className="hidden items-center gap-9 justify-self-center md:flex">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} end={item.to === "/"} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <button className="btn-press grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="Thông báo">
              <Bell className="h-5 w-5" />
            </button>
            <Link to="/login" className="btn-press rounded-2xl bg-brand-700 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-brand-700/18 hover:bg-brand-800">
              Đăng nhập
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="btn-press grid h-10 w-10 place-items-center justify-self-end rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
            aria-label="Mở menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="animate-fade-in mx-auto max-w-[1180px] border-t border-slate-100 py-3 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    [
                      "rounded-2xl px-4 py-3 text-sm font-bold",
                      isActive ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-brand-50 hover:text-brand-800",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <Link to="/login" onClick={() => setMobileOpen(false)} className="rounded-2xl bg-brand-700 px-4 py-3 text-center text-sm font-extrabold text-white">
                Đăng nhập
              </Link>
            </div>
          </div>
        )}
      </nav>

      <section className="flex w-full flex-1 flex-col">
        <Outlet />
      </section>

      <footer className="border-t border-white/70 bg-white/70 px-6 py-6 text-center text-xs font-semibold text-slate-500">
        © 2026 Trường Đại học Trà Vinh. Tất cả quyền được bảo lưu.
      </footer>
    </main>
  );
}
