import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import Header from "../components/common/Header";
import Sidebar from "../components/common/Sidebar";
import { getCurrentUser } from "../data/mockAuth";

export default function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const user = getCurrentUser();

  if (!user || user.role !== "SUPER_ADMIN") return <Navigate to="/login" replace />;

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
          title="Tổng quan toàn trường"
          showWorkspaceTitle={false}
        />
        <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="page-enter mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
            <Outlet />
          </div>
        </section>
      </div>
    </main>
  );
}
