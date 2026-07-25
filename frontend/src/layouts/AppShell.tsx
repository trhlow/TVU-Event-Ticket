import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Header from "../components/common/Header";
import PageGreeting from "../components/common/PageGreeting";
import Sidebar from "../components/common/Sidebar";
import ScrollToTopButton from "../components/common/ScrollToTopButton";
import { getCurrentUser } from "../state/authSession";
import type { User } from "../types/user";

interface AppShellProps {
  requiredRole: User["role"];
  scrollRegionId: string;
  headerTitle?: string;
  showWorkspaceTitle?: boolean;
  showGreeting?: boolean;
  contentMaxWidth?: string;
}

/**
 * Single authenticated shell shared by the student/organizer/admin layouts — sidebar +
 * header + scrollable content region. Role-specific behavior (guard, header title, greeting)
 * is passed in by the thin per-role layout wrapper so route imports stay unchanged.
 */
export default function AppShell({
  requiredRole,
  scrollRegionId,
  headerTitle,
  showWorkspaceTitle = true,
  showGreeting = false,
  contentMaxWidth = "1240px",
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const user = getCurrentUser();
  const scrollRegionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (location.hash) return;
    scrollRegionRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname, location.hash]);

  if (!user || user.role !== requiredRole) return <Navigate to="/login" replace />;

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
          title={headerTitle}
          showWorkspaceTitle={showWorkspaceTitle}
        />
        <section ref={scrollRegionRef} id={scrollRegionId} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {showGreeting && <PageGreeting name={user.fullName} />}
          <div key={location.pathname} className="page-enter mx-auto w-full px-4 py-4 sm:px-5 lg:px-6 lg:py-6" style={{ maxWidth: contentMaxWidth }}>
            <Outlet />
          </div>
          <ScrollToTopButton scrollContainerId={scrollRegionId} />
        </section>
      </div>
    </main>
  );
}
