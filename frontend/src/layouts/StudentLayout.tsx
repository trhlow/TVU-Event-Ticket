import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import Header from "../components/common/Header";
import Sidebar from "../components/common/Sidebar";
import { getCurrentUser } from "../data/mockAuth";

export default function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = getCurrentUser();

  if (!user || user.role !== "SINH_VIEN") return <Navigate to="/login" replace />;

  return (
    <main className="app-shell-surface flex h-screen w-full max-w-full overflow-hidden font-sans">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 w-[258px] transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:ml-[258px]">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} title={`Xin chào, ${user.fullName}`} />
        <section className="min-h-0 flex-1 overflow-y-auto">
          <div className="page-enter mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </section>
      </div>
    </main>
  );
}
