import React, { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import Header from "../components/common/Header";
import Sidebar from "../components/common/Sidebar";
import { getCurrentUser } from "../data/mockAuth";

export default function OrganizerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = getCurrentUser();

  if (!user || user.role !== "ORGANIZER") return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-[#FBF8FF] font-sans">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:pl-[258px]">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} title={user.clubName || "CLB Tin học TVU"} />
        <main className="mx-auto w-full max-w-[1024px] flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
