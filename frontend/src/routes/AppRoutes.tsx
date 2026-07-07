import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Layouts
const PublicLayout = lazy(() => import("../layouts/PublicLayout"));
const StudentLayout = lazy(() => import("../layouts/StudentLayout"));
const OrganizerLayout = lazy(() => import("../layouts/OrganizerLayout"));
const SuperAdminLayout = lazy(() => import("../layouts/SuperAdminLayout"));

// Guard
import ProtectedRoute from "./ProtectedRoute";

// Public Pages
const LandingPage = lazy(() => import("../pages/public/LandingPage"));
const LoginPage = lazy(() => import("../pages/public/LoginPage"));
const ForbiddenPage = lazy(() => import("../pages/public/ForbiddenPage"));
const ServerErrorPage = lazy(() => import("../pages/public/ServerErrorPage"));
const FeaturePlaceholderPage = lazy(() => import("../pages/common/FeaturePlaceholderPage"));
const NotFound404Page = lazy(() => import("../pages/common/NotFound404Page"));

// Student Pages
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

// Organizer Pages
const OrganizerDashboard = lazy(() => import("../pages/organizer/OrganizerDashboard"));
const OrganizerEventsPage = lazy(() => import("../pages/organizer/OrganizerEventsPage"));
const OrganizerReservationsPage = lazy(() => import("../pages/organizer/OrganizerReservationsPage"));
const OrganizerScanPage = lazy(() => import("../pages/organizer/OrganizerScanPage"));
const OrganizerEventDetailPage = lazy(() => import("../pages/organizer/OrganizerEventDetailPage"));
const OrganizerTicketsPage = lazy(() => import("../pages/organizer/OrganizerTicketsPage"));
const AttendeesPage = lazy(() => import("../pages/organizer/AttendeesPage"));
const ClubReportPage = lazy(() => import("../pages/organizer/ClubReportPage"));
const OrganizerCreateEventPage = lazy(() => import("../pages/organizer/OrganizerCreateEventPage"));
const OrganizerRegistrationQRPage = lazy(() => import("../pages/organizer/OrganizerRegistrationQRPage"));
const OrganizerEventStatsPage = lazy(() => import("../pages/organizer/OrganizerEventStatsPage"));

// Admin Pages
const SuperAdminDashboard = lazy(() => import("../pages/admin/SuperAdminDashboard"));
const SuperAdminClubsPage = lazy(() => import("../pages/admin/SuperAdminClubsPage"));
const SuperAdminUsersPage = lazy(() => import("../pages/admin/SuperAdminUsersPage"));
const SuperAdminLogsPage = lazy(() => import("../pages/admin/SuperAdminLogsPage"));
const SuperAdminOrganizersPage = lazy(() => import("../pages/admin/SuperAdminOrganizersPage"));
const SuperAdminStudentsPage = lazy(() => import("../pages/admin/SuperAdminStudentsPage"));
const SuperAdminRBACPage = lazy(() => import("../pages/admin/SuperAdminRBACPage"));
const SuperAdminStatsPage = lazy(() => import("../pages/admin/SuperAdminStatsPage"));
const SuperAdminSettingsPage = lazy(() => import("../pages/admin/SuperAdminSettingsPage"));
const SuperAdminEventsPage = lazy(() => import("../pages/admin/SuperAdminEventsPage"));
const SuperAdminClubDetailPage = lazy(() => import("../pages/admin/SuperAdminClubDetailPage"));

function routeElement(element: React.ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

// Auth checker
export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={routeElement(<PublicLayout />)}>
        <Route
          path="/"
          element={<LandingPage />}
        />
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/complete-profile"
          element={<CompleteProfilePage />}
        />
        <Route
          path="/notifications"
          element={
            <FeaturePlaceholderPage
              title="Thông báo"
              description="Khu vực này sẽ hiển thị thông báo hệ thống, thông báo duyệt đăng ký, và nhắc nhở sự kiện cho cả ba vai trò."
              backTo="/"
              backLabel="Về trang chủ"
              highlights={[
                "Thông báo duyệt đăng ký",
                "Nhắc lịch sự kiện",
                "Cảnh báo hệ thống",
              ]}
            />
          }
        />
        <Route
          path="/account/settings"
          element={
            <FeaturePlaceholderPage
              title="Cài đặt tài khoản"
              description="Trang cài đặt chung cho thay đổi thông tin hồ sơ, mật khẩu, và tùy chọn nhận thông báo."
              backTo="/"
              backLabel="Về trang chủ"
              highlights={[
                "Hồ sơ cá nhân",
                "Bảo mật tài khoản",
                "Tùy chọn thông báo",
              ]}
            />
          }
        />
        <Route
          path="/403"
          element={<ForbiddenPage />}
        />
        <Route
          path="/500"
          element={<ServerErrorPage />}
        />
        <Route
          path="/404"
          element={<NotFound404Page />}
        />
      </Route>

      {/* Student Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={["SINH_VIEN"]} />}>
        <Route element={routeElement(<StudentLayout />)}>
          <Route
            path="/student"
            element={
              <Navigate
                to="/student/home"
                replace
              />
            }
          />
          <Route
            path="/student/home"
            element={<StudentHomePage />}
          />
          <Route
            path="/student/events"
            element={<StudentEventListPage />}
          />
          <Route
            path="/student/events/:eventId"
            element={<StudentEventDetailPage />}
          />
          <Route
            path="/student/events/:eventId/register"
            element={<EventRegistrationConfirmPage />}
          />
          <Route
            path="/student/registrations/success"
            element={<EventRegistrationResultPage />}
          />
          <Route
            path="/student/registrations/success/:reservationId"
            element={<EventRegistrationResultPage />}
          />
          <Route
            path="/student/registrations"
            element={<MyRegistrationsPage />}
          />
          <Route
            path="/student/tickets"
            element={<MyTicketsPage />}
          />
          <Route
            path="/student/tickets/:ticketId"
            element={<TicketQRPage />}
          />
          <Route
            path="/student/history"
            element={<StudentHistoryPage />}
          />
          <Route
            path="/student/profile"
            element={<StudentProfilePage />}
          />
          <Route
            path="/student/profile/complete"
            element={<CompleteProfilePage />}
          />
        </Route>
      </Route>

      {/* Organizer Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={["ORGANIZER"]} />}>
        <Route element={routeElement(<OrganizerLayout />)}>
          <Route
            path="/organizer"
            element={
              <Navigate
                to="/organizer/dashboard"
                replace
              />
            }
          />
          <Route
            path="/organizer/dashboard"
            element={<OrganizerDashboard />}
          />
          <Route
            path="/organizer/events"
            element={<OrganizerEventsPage />}
          />
          <Route
            path="/organizer/events/create"
            element={<OrganizerCreateEventPage />}
          />
          <Route
            path="/organizer/events/:eventId/edit"
            element={
              <FeaturePlaceholderPage
                title="Chỉnh sửa sự kiện"
                description="Trang chỉnh sửa sự kiện sẽ cho phép cập nhật nội dung, thời gian, và số lượng vé còn lại."
                backTo="/organizer/events"
                backLabel="Về danh sách sự kiện"
                highlights={["Cập nhật nội dung", "Đổi thời gian", "Điều chỉnh vé"]}
              />
            }
          />
          <Route
            path="/organizer/events/:eventId"
            element={<OrganizerEventDetailPage />}
          />
          <Route
            path="/organizer/events/:eventId/registration-qr"
            element={<OrganizerRegistrationQRPage />}
          />
          <Route
            path="/organizer/registration-qr"
            element={<OrganizerRegistrationQRPage />}
          />
          <Route
            path="/organizer/events/:eventId/registrations"
            element={<OrganizerReservationsPage />}
          />
          <Route
            path="/organizer/events/:eventId/participants"
            element={<AttendeesPage />}
          />
          <Route
            path="/organizer/events/:eventId/check-in"
            element={<OrganizerScanPage />}
          />
          <Route
            path="/organizer/events/:eventId/check-in/history"
            element={
              <FeaturePlaceholderPage
                title="Lịch sử quét QR"
                description="Trang này sẽ lưu lịch sử quét vé điện tử, bao gồm mã vé, thời điểm quét, và trạng thái hợp lệ."
                backTo="/organizer/dashboard"
                backLabel="Về tổng quan"
                highlights={["Quét hợp lệ", "Quét trùng", "Quét sai sự kiện"]}
              />
            }
          />
          <Route
            path="/organizer/events/:eventId/statistics"
            element={<OrganizerEventStatsPage />}
          />
          <Route
            path="/organizer/members"
            element={<AttendeesPage />}
          />
          <Route
            path="/organizer/notifications"
            element={
              <FeaturePlaceholderPage
                title="Thông báo"
                description="Thông báo liên quan tới sự kiện của CLB, trạng thái đăng ký, và nhắc nhở check-in sẽ hiển thị tại đây."
                backTo="/organizer/dashboard"
                backLabel="Về tổng quan"
                highlights={["Duyệt đăng ký", "Nhắc check-in", "Cảnh báo sự kiện"]}
              />
            }
          />
          <Route
            path="/organizer/account/settings"
            element={
              <FeaturePlaceholderPage
                title="Cài đặt tài khoản"
                description="Trang cài đặt cho ban tổ chức sẽ cho phép cập nhật hồ sơ và tuỳ chọn thông báo."
                backTo="/organizer/dashboard"
                backLabel="Về tổng quan"
                highlights={["Hồ sơ tổ chức", "Bảo mật", "Thông báo"]}
              />
            }
          />
          <Route
            path="/organizer/reservations"
            element={<OrganizerReservationsPage />}
          />
          <Route
            path="/organizer/tickets"
            element={<OrganizerTicketsPage />}
          />
          <Route
            path="/organizer/scan"
            element={<OrganizerScanPage />}
          />
          <Route
            path="/organizer/check-in"
            element={<OrganizerScanPage />}
          />
          <Route
            path="/organizer/attendees"
            element={<AttendeesPage />}
          />
          <Route
            path="/organizer/reports"
            element={<ClubReportPage />}
          />
        </Route>
      </Route>

      {/* Super Admin Protected Routes */}
      <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} />}>
        <Route element={routeElement(<SuperAdminLayout />)}>
          <Route
            path="/admin"
            element={
              <Navigate
                to="/admin/dashboard"
                replace
              />
            }
          />
          <Route
            path="/admin/dashboard"
            element={<SuperAdminDashboard />}
          />
          <Route
            path="/admin/clubs"
            element={<SuperAdminClubsPage />}
          />
          <Route
            path="/admin/clubs/create"
            element={
              <FeaturePlaceholderPage
                title="Tạo câu lạc bộ"
                description="Biểu mẫu tạo câu lạc bộ mới cho quản trị viên nhà trường sẽ nằm ở đây."
                backTo="/admin/clubs"
                backLabel="Về danh sách CLB"
                highlights={["Tên CLB", "Mã CLB", "Trạng thái hoạt động"]}
              />
            }
          />
          <Route
            path="/admin/clubs/:clubId"
            element={<SuperAdminClubDetailPage />}
          />
          <Route
            path="/admin/clubs/:clubId/edit"
            element={
              <FeaturePlaceholderPage
                title="Chỉnh sửa câu lạc bộ"
                description="Trang chỉnh sửa CLB cho phép cập nhật tên, mã và trạng thái hoạt động."
                backTo="/admin/clubs"
                backLabel="Về danh sách CLB"
                highlights={["Cập nhật hồ sơ", "Đổi trạng thái", "Lưu thay đổi"]}
              />
            }
          />
          <Route
            path="/admin/accounts"
            element={<SuperAdminOrganizersPage />}
          />
          <Route
            path="/admin/accounts/create"
            element={
              <FeaturePlaceholderPage
                title="Tạo tài khoản Ban tổ chức"
                description="Trang này sẽ tạo tài khoản tổ chức sự kiện cho các câu lạc bộ."
                backTo="/admin/accounts"
                backLabel="Về danh sách tài khoản"
                highlights={["Tên đăng nhập", "CLB phụ trách", "Phân quyền"]}
              />
            }
          />
          <Route
            path="/admin/events"
            element={<SuperAdminEventsPage />}
          />
          <Route
            path="/admin/events/:eventId"
            element={
              <FeaturePlaceholderPage
                title="Chi tiết sự kiện toàn trường"
                description="Trang này sẽ hiển thị chi tiết sự kiện, số vé, lịch sử duyệt và hoạt động check-in."
                backTo="/admin/events"
                backLabel="Về danh sách sự kiện"
                highlights={["Duyệt đăng ký", "Tỷ lệ check-in", "Nhật ký hoạt động"]}
              />
            }
          />
          <Route
            path="/admin/statistics"
            element={<SuperAdminStatsPage />}
          />
          <Route
            path="/admin/audit-logs"
            element={<SuperAdminLogsPage />}
          />
          <Route
            path="/admin/roles"
            element={<SuperAdminRBACPage />}
          />
          <Route
            path="/admin/notifications"
            element={
              <FeaturePlaceholderPage
                title="Thông báo"
                description="Thông báo hệ thống và cảnh báo quản trị sẽ hiển thị ở đây cho quản trị viên nhà trường."
                backTo="/admin/dashboard"
                backLabel="Về tổng quan"
                highlights={["Cảnh báo hệ thống", "Duyệt CLB", "Nhật ký hoạt động"]}
              />
            }
          />
          <Route
            path="/admin/account/settings"
            element={
              <FeaturePlaceholderPage
                title="Cài đặt tài khoản"
                description="Trang cài đặt tài khoản quản trị viên dùng để cập nhật thông tin và tuỳ chọn thông báo."
                backTo="/admin/dashboard"
                backLabel="Về tổng quan"
                highlights={["Hồ sơ quản trị", "Bảo mật", "Tùy chọn thông báo"]}
              />
            }
          />
          <Route
            path="/admin/users"
            element={<SuperAdminUsersPage />}
          />
          <Route
            path="/admin/organizers"
            element={<SuperAdminOrganizersPage />}
          />
          <Route
            path="/admin/students"
            element={<SuperAdminStudentsPage />}
          />
          <Route
            path="/admin/rbac"
            element={<SuperAdminRBACPage />}
          />
          <Route
            path="/admin/logs"
            element={<SuperAdminLogsPage />}
          />
          <Route
            path="/admin/settings"
            element={<SuperAdminSettingsPage />}
          />
        </Route>
      </Route>

      {/* Catch-all redirect */}
      <Route
        path="*"
        element={routeElement(<NotFound404Page />)}
      />
    </Routes>
  );
}
