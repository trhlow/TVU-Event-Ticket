# Frontend implementation status — post-hardening pass (2026-07)

This tracks what changed in the frontend-only hardening pass that followed the full-project audit.
No file under `backend/` was touched — every "Blocked by backend" item below is expanded in
[BACKEND_SECURITY_REQUIREMENTS.md](BACKEND_SECURITY_REQUIREMENTS.md).

> **2026-07-17 update:** this is a historical hardening record. EPIC 6 and EPIC UI subsequently delivered
> the SUPER_ADMIN statistics slices and paginated audit-log API; those table entries should not be read as
> current backend gaps. Frontend pages that still show pending/demo state require a separate integration pass.

| Chức năng | Trạng thái trước | Thay đổi đã thực hiện | API thật | Mock | Blocked by backend |
| --- | --- | --- | --- | --- | --- |
| Đăng nhập sinh viên (Microsoft) | Nút Microsoft + form nội bộ trộn lẫn trên cùng một trang, không phân biệt rõ chế độ dev | Tách 3 nhánh rõ ràng: Microsoft (khi `VITE_AUTH_PROVIDER=microsoft`), DevStub dev-only (badge "DEV ONLY", chỉ tồn tại khi `import.meta.env.DEV`, bị loại khỏi bundle production), Admin/Organizer (luôn khóa) | Có (`POST /auth/login`, `GET /auth/me`) | Không | Không |
| Đăng nhập Organizer/Admin | Form email/mật khẩu hiển thị bình thường, chỉ chặn khi bấm submit | Toàn bộ input bị `disabled`/`readOnly`, nút submit bị khóa vĩnh viễn, thông báo cố định đúng câu yêu cầu nghiệp vụ | Không gửi request nào | Không | Có (mục 1, 6) |
| Route guard (`ProtectedRoute`) | Lỗi mạng và phiên hết hạn xử lý giống nhau (đều chuyển `/login`) | Phân biệt lỗi kết nối (status 0) với phiên không hợp lệ (401/403); lỗi kết nối hiển thị trạng thái riêng + nút "Thử lại", không tự chuyển `/login` | Có (`GET /auth/me`) | Không | Không |
| Auth state module | File `src/data/mockAuth.ts` — tên gây hiểu lầm dù chỉ cache session thật | Đổi tên thành `src/state/authSession.ts`, cập nhật toàn bộ 24 import, hành vi giữ nguyên | N/A | N/A | Không |
| Env validation | Không có kiểm tra khi khởi động | `src/lib/env.ts` + `App.tsx`: chặn hẳn ứng dụng nếu `VITE_AUTH_PROVIDER` không hợp lệ hoặc `devstub` chạy production; cảnh báo nếu demo/mock fallback bật trong production | N/A | N/A | Không |
| Silent mock fallback (event/reservation/ticket/club/organizer/audit) | Khi API lỗi và `VITE_ENABLE_MOCK_FALLBACK=true` (kể cả không bật demo mode), service âm thầm trả dữ liệu mock | Gỡ toàn bộ nhánh catch-and-fallback; chỉ `VITE_USE_DEMO_DATA=true` mới trả mock — lỗi API luôn `throw` để UI hiển thị lỗi thật | Có (khi không demo) | Chỉ khi demo mode bật rõ ràng | Không |
| SuperAdminDashboard | 100% dữ liệu mock, không gọi API nào | Gọi `statisticsService.assertSupported()`; hiển thị `BackendPendingNotice` khi chưa có API, badge "Dữ liệu demo" khi demo mode bật | Chưa | Chỉ khi demo mode | Có (mục 14) |
| SuperAdminUsersPage | Nút "Cấp quyền BTC / Hạ quyền SV" chỉ đổi state cục bộ, báo thành công giả | Loại bỏ hoàn toàn hành động giả; gọi `userService.list()` thật (throw nếu không demo); `BackendPendingNotice` khi thiếu API | Chưa | Chỉ khi demo mode | Có (mục 14) |
| SuperAdminStudentsPage | Import `mockUsers` trực tiếp; nút khóa/mở khóa chỉ đổi state cục bộ | Gọi `userService.listStudents()` thật; loại nút khóa/mở khóa giả; `BackendPendingNotice` khi thiếu API | Chưa | Chỉ khi demo mode | Có (mục 14) |
| SuperAdminStatsPage | 100% dữ liệu mock | Gate bằng `statisticsService`; `BackendPendingNotice` + badge demo | Chưa | Chỉ khi demo mode | Có (mục 14) |
| SuperAdminClubDetailPage | Toàn bộ 5 tab (tổng quan/thành viên/sự kiện/thống kê/nhật ký) đều mock | Tab **Tổng quan** và **Thành viên** nối API thật (`clubService.getByIdRemote`, `userService.listOrganizersRemote` lọc theo `clubId`); tab **Sự kiện/Thống kê/Nhật ký** hiển thị `BackendPendingNotice` vì backend chưa có API cross-club tương ứng | Một phần (2/5 tab) | Không | Có (3/5 tab — mục 14) |
| ClubReportPage (Organizer) | 100% biểu đồ mock trình bày như số liệu thật | Thay toàn bộ bằng `BackendPendingNotice`, giữ nguyên layout/breadcrumb | Chưa | Không | Có (mục 14) |
| SuperAdminLogsPage | Lỗi bị nuốt bởi Toast thoáng qua, bảng trống không giải thích | `BackendPendingNotice` cố định khi API chưa hỗ trợ; giữ bộ lọc vai trò/hành động khi có dữ liệu (demo mode) | Chưa (đã gọi `auditLogService.listRemote()` thật, nhưng backend chưa có endpoint đọc) | Chỉ khi demo mode | Có (mục 14) |
| SuperAdminOrganizersPage | Đã trung thực từ trước (form tạo bị khóa, có banner giải thích) | Không thay đổi — xác nhận vẫn đúng yêu cầu | Có (list/lock) | Không | Có (tạo mới — mục 1, 6) |
| Event → tên CLB hiển thị | `clubName` hardcode `"Cau lac bo TVU"` cho **mọi** sự kiện | Đổi thành fallback trung lập `"Chưa có thông tin CLB"` | — | — | Có (mục 15 — `EventResponse` thiếu field) |
| Header Organizer → tên CLB | Hardcode `"CLB Tin học TVU"` khi thiếu `clubName` | Đổi thành fallback trung lập `"Chưa có thông tin CLB"` | — | — | Có (mục 15 — profile response thiếu `clubName`) |
| Reservation → tên sinh viên | `studentName` bị gán bằng `studentEmail`, trông như tên thật | Để trống; UI đã có sẵn `|| reservation.email` nên tự hiển thị email khi thiếu tên | — | — | Có (mục 15 — `ReservationResponse` thiếu field) |
| OrganizerRegistrationQRPage | Mã QR giả (hình caro theo hash chuỗi) + nút "Tải PNG/PDF" báo "đã chuẩn bị" dù không tạo file nào | Bỏ hình QR giả, hiển thị hộp trạng thái trung thực + liên kết thật bên dưới; bỏ 2 nút tải giả; giữ "Sao chép liên kết" và "In trang này" (hành động thật) | N/A (không phải payload backend, chỉ là URL) | Không | Không (không cần backend, chỉ cần bỏ giao diện giả) |
| QRDisplayCard (vé sinh viên) | Khi có `qrCodeValue`, render `FakeQRCode` không mã hoá payload thật | Hiển thị payload thật dạng text khi có; thông báo trung thực khi chưa có; bỏ `FakeQRCode` | Payload đến từ backend khi có | Không | Có (mục 13 — chưa có endpoint lấy lại QR) |
| Dependency hygiene | `axios` khai báo nhưng không dùng ở đâu | Gỡ khỏi `package.json`/lockfile; `npm audit` 0 lỗ hổng | — | — | Không |
| `.gitignore` | Không có rule tường minh cho `.env`/`.env.*` | Bổ sung `.env`, `.env.*`, `!.env.example`, `coverage/` | — | — | Không |
| Test framework | Không có test nào | Thêm Vitest + React Testing Library + jsdom; 7 file, 27 test case (auth/route-guard/api-client/service fallback/Super Admin honest-state) | — | — | Không |
| CI | Chỉ build/test backend, không có bước nào cho frontend | Thêm job `frontend` chạy song song job backend (path-filtered theo `frontend/**`): `npm ci` → lint → test → build (env production an toàn) → `npm audit` (không chặn pipeline) → 2 bước guard (chặn nếu có `.env` thật bị commit hoặc bundle production chứa chuỗi DevStub/tài khoản demo) | — | — | Không |

## Ghi chú về hành vi không đổi

- Luồng nghiệp vụ cốt lõi của Sinh viên (xem sự kiện, đăng ký, xem vé) và Organizer (tạo/sửa sự
  kiện, duyệt/từ chối đăng ký, check-in, xuất attendee) **không bị thay đổi** — chỉ các service
  layer bên dưới được sửa để không còn fallback mock âm thầm; hành vi khi API hoạt động bình
  thường giữ nguyên 100%.
- `getCurrentUser()` trong `state/authSession.ts` vẫn giữ kiểu trả về `User` (không `| null`) dù
  giá trị runtime có thể là `null` khi chưa đăng nhập — đây là hạn chế kiểu dữ liệu có từ trước,
  không phải lỗi mới; không sửa trong lần này để tránh rủi ro thay đổi hành vi ngoài phạm vi.
- `SuperAdminEventsPage` và `OrganizerEventStatsPage` vẫn còn dùng dữ liệu mock 100% giống hiện
  trạng ban đầu — **không nằm trong danh sách 8 trang bắt buộc kiểm tra ở Giai đoạn 4** nên chưa
  được xử lý trong lần này; cần một lượt làm việc riêng nếu muốn đưa về trạng thái trung thực
  tương tự.
