import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Header from "../components/common/Header";
import PageGreeting from "../components/common/PageGreeting";
import Sidebar from "../components/common/Sidebar";
import ScrollToTopButton from "../components/common/ScrollToTopButton";
import { getCurrentUser } from "../state/authSession";

export default function OrganizerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const user = getCurrentUser();

  if (!user || user.role !== "ORGANIZER") return <Navigate to="/login" replace />;

  return (
    <main className="app-shell-surface flex h-screen w-full max-w-full overflow-hidden font-sans">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-[300px] transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className={`fixed inset-y-0 left-0 z-40 hidden transition-all duration-300 lg:block ${collapsed ? "w-[88px]" : "w-[280px]"}`}>
        <Sidebar collapsed={collapsed} />
      </div>

      <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${collapsed ? "lg:ml-[88px]" : "lg:ml-[280px]"}`}>
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          collapsed={collapsed}
          title={user.clubName || "Chưa có thông tin CLB"}
        />
        <section id="organizer-scroll-region" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <PageGreeting name={user.fullName} />
          <div key={location.pathname} className="page-enter mx-auto w-full max-w-[1240px] px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
            <Outlet />
          </div>
          <ScrollToTopButton scrollContainerId="organizer-scroll-region" />
        </section>
      </div>
    </main>
  );
}
