import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router";
import ProtectedRoute from "./ProtectedRoute";

const PublicLayout = lazy(() => import("../layouts/PublicLayout"));
const StudentLayout = lazy(() => import("../layouts/StudentLayout"));
const OrganizerLayout = lazy(() => import("../layouts/OrganizerLayout"));
const SuperAdminLayout = lazy(() => import("../layouts/SuperAdminLayout"));

const LandingPage = lazy(() => import("../pages/public/LandingPage"));
const LoginPage = lazy(() => import("../pages/public/LoginPage"));
const ForbiddenPage = lazy(() => import("../pages/public/ForbiddenPage"));
const ServerErrorPage = lazy(() => import("../pages/public/ServerErrorPage"));
const NotFound404Page = lazy(() => import("../pages/common/NotFound404Page"));
const RoleProfilePage = lazy(() => import("../pages/common/RoleProfilePage"));

const StudentHomePage = lazy(() => import("../pages/student/StudentHomePage"));
const CompleteProfilePage = lazy(() => import("../pages/student/CompleteProfilePage"));
const StudentEventListPage = lazy(() => import("../pages/student/StudentEventListPage"));
const StudentEventDetailPage = lazy(() => import("../pages/student/StudentEventDetailPage"));
const EventRegistrationConfirmPage = lazy(() => import("../pages/student/EventRegistrationConfirmPage"));
const EventRegistrationResultPage = lazy(() => import("../pages/student/EventRegistrationResultPage"));
const MyRegistrationsPage = lazy(() => import("../pages/student/MyRegistrationsPage"));
const MyTicketsPage = lazy(() => import("../pages/student/MyTicketsPage"));
const StudentProfilePage = lazy(() => import("../pages/student/StudentProfilePage"));
const TicketQRPage = lazy(() => import("../pages/student/TicketQRPage"));
const StudentHistoryPage = lazy(() => import("../pages/student/StudentHistoryPage"));

const OrganizerDashboard = lazy(() => import("../pages/organizer/OrganizerDashboard"));
const OrganizerEventsPage = lazy(() => import("../pages/organizer/OrganizerEventsPage"));
const OrganizerReservationsPage = lazy(() => import("../pages/organizer/OrganizerReservationsPage"));
const OrganizerScanPage = lazy(() => import("../pages/organizer/OrganizerScanPage"));
const OrganizerEventDetailPage = lazy(() => import("../pages/organizer/OrganizerEventDetailPage"));
const OrganizerTicketsPage = lazy(() => import("../pages/organizer/OrganizerTicketsPage"));
const AttendeesPage = lazy(() => import("../pages/organizer/AttendeesPage"));
const OrganizerCreateEventPage = lazy(() => import("../pages/organizer/OrganizerCreateEventPage"));
const OrganizerEditEventPage = lazy(() => import("../pages/organizer/OrganizerEditEventPage"));
const OrganizerRegistrationQRPage = lazy(() => import("../pages/organizer/OrganizerRegistrationQRPage"));
const OrganizerEventStatsPage = lazy(() => import("../pages/organizer/OrganizerEventStatsPage"));

const SuperAdminDashboard = lazy(() => import("../pages/admin/SuperAdminDashboard"));
const SuperAdminClubsPage = lazy(() => import("../pages/admin/SuperAdminClubsPage"));
const SuperAdminUsersPage = lazy(() => import("../pages/admin/SuperAdminUsersPage"));
const SuperAdminLogsPage = lazy(() => import("../pages/admin/SuperAdminLogsPage"));
const SuperAdminOrganizersPage = lazy(() => import("../pages/admin/SuperAdminOrganizersPage"));
const SuperAdminStudentsPage = lazy(() => import("../pages/admin/SuperAdminStudentsPage"));
const SuperAdminRBACPage = lazy(() => import("../pages/admin/SuperAdminRBACPage"));
const SuperAdminEventsPage = lazy(() => import("../pages/admin/SuperAdminEventsPage"));
const SuperAdminClubDetailPage = lazy(() => import("../pages/admin/SuperAdminClubDetailPage"));

function routeElement(element: React.ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[260px] place-items-center p-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
            Đang tải giao diện...
          </div>
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={routeElement(<PublicLayout />)}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/events" element={<Navigate to="/login" replace />} />
        <Route path="/events/:eventId" element={<Navigate to="/login" replace />} />
        <Route path="/guide" element={<Navigate to="/#guide" replace />} />
        <Route path="/huong-dan" element={<Navigate to="/#guide" replace />} />
        <Route path="/public/events" element={<Navigate to="/login" replace />} />
        <Route path="/public/guide" element={<Navigate to="/#guide" replace />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/500" element={<ServerErrorPage />} />
        <Route path="/404" element={<NotFound404Page />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["SINH_VIEN"]} />}>
        <Route element={routeElement(<StudentLayout />)}>
          <Route path="/student" element={<Navigate to="/student/home" replace />} />
          <Route path="/student/home" element={<StudentHomePage />} />
          <Route path="/student/events" element={<StudentEventListPage />} />
          <Route path="/student/events/:eventId" element={<StudentEventDetailPage />} />
          <Route path="/student/events/:eventId/register" element={<EventRegistrationConfirmPage />} />
          <Route path="/student/registrations/success/:reservationId" element={<EventRegistrationResultPage />} />
          <Route path="/student/registrations" element={<MyRegistrationsPage />} />
          <Route path="/student/tickets" element={<MyTicketsPage />} />
          <Route path="/student/tickets/:ticketId" element={<TicketQRPage />} />
          <Route path="/student/history" element={<StudentHistoryPage />} />
          <Route path="/student/profile" element={<StudentProfilePage />} />
          <Route path="/student/account" element={<StudentProfilePage />} />
          <Route path="/student/profile/complete" element={<CompleteProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["ORGANIZER"]} />}>
        <Route element={routeElement(<OrganizerLayout />)}>
          <Route path="/organizer" element={<Navigate to="/organizer/dashboard" replace />} />
          <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
          <Route path="/organizer/events" element={<OrganizerEventsPage />} />
          <Route path="/organizer/events/create" element={<OrganizerCreateEventPage />} />
          <Route path="/organizer/events/:eventId/edit" element={<OrganizerEditEventPage />} />
          <Route path="/organizer/events/:eventId" element={<OrganizerEventDetailPage />} />
          <Route path="/organizer/registration-qr" element={<OrganizerRegistrationQRPage />} />
          <Route path="/organizer/events/:eventId/registration-qr" element={<OrganizerRegistrationQRPage />} />
          <Route path="/organizer/events/:eventId/registrations" element={<OrganizerReservationsPage />} />
          <Route path="/organizer/events/:eventId/participants" element={<AttendeesPage />} />
          <Route path="/organizer/events/:eventId/check-in" element={<OrganizerScanPage />} />
          <Route path="/organizer/events/:eventId/statistics" element={<OrganizerEventStatsPage />} />
          <Route path="/organizer/members" element={<AttendeesPage />} />
          <Route path="/organizer/reservations" element={<OrganizerReservationsPage />} />
          <Route path="/organizer/tickets" element={<OrganizerTicketsPage />} />
          <Route path="/organizer/check-in" element={<OrganizerScanPage />} />
          <Route path="/organizer/profile" element={<RoleProfilePage scope="organizer" />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} />}>
        <Route element={routeElement(<SuperAdminLayout />)}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<SuperAdminDashboard />} />
          <Route path="/admin/clubs" element={<SuperAdminClubsPage />} />
          <Route path="/admin/clubs/:clubId" element={<SuperAdminClubDetailPage />} />
          <Route path="/admin/accounts" element={<SuperAdminOrganizersPage />} />
          <Route path="/admin/events" element={<SuperAdminEventsPage />} />
          <Route path="/admin/audit-logs" element={<SuperAdminLogsPage />} />
          <Route path="/admin/roles" element={<SuperAdminRBACPage />} />
          <Route path="/admin/users" element={<SuperAdminUsersPage />} />
          <Route path="/admin/students" element={<SuperAdminStudentsPage />} />
          <Route path="/admin/profile" element={<RoleProfilePage scope="admin" />} />
        </Route>
      </Route>

      <Route path="*" element={routeElement(<NotFound404Page />)} />
    </Routes>
  );
}
