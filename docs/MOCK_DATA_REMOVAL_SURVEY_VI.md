# Khảo sát gỡ dữ liệu ảo khỏi frontend (2026-07-28)

Khảo sát trước khi sửa, theo yêu cầu "loại bỏ hết dữ liệu ảo" sau khi
production đã deploy trên `main`. **Chưa sửa gì** — tài liệu này để duyệt.

> ⚠️ Khảo sát chạy trên nhánh `hlow` (`31622c33`), **hơn `origin/main`
> (`8cef2d78`) 25 commit**; riêng `frontend/src` lệch ~100 file. Đã spot-check
> `origin/main:frontend/src/services/eventService.ts`: cùng pattern
> demo-gate, không có silent fallback — nên kết luận "production không phục vụ
> dữ liệu ảo" đúng cho cả hai nhánh. Nhưng số dòng dưới đây theo `hlow`.

## Kết luận ngắn

1. ⛔ **SỬA LẠI (2026-07-28): dữ liệu ảo CÓ trong artifact production.**
   Bản đầu của tài liệu này viết "production không phục vụ dữ liệu ảo" —
   đúng theo nghĩa hẹp là *cờ đang tắt*, nhưng sai ở chỗ quan trọng hơn:
   fixture vẫn được đóng gói và tải về máy người dùng.
   - `frontend/dist/assets/` có 3 chunk riêng: `mockClubs-CKIiTdil.js`,
     `mockEvents-CQzUOhRa.js`, `mockTickets-xv_668WE.js`.
   - `dist/assets/userService-*.js` chứa **14 email fixture**; toàn bộ
     `dist/assets/*.js` có **17 email duy nhất**, trong đó có **một địa chỉ
     Gmail cá nhân thật** (không ghi nguyên văn ở đây vì repo có thể public —
     tra bằng grep). Kèm theo là các mã dạng MSSV.
   - Lý do: 9 `import ... from "../data/mock*"` nằm ở **top-level** service.
     `apiConfig.useDemoData` là thuộc tính đọc lúc chạy, không phải hằng số
     fold được, nên tree-shaking không cắt — build với
     `VITE_USE_DEMO_DATA=false` vẫn ship đủ fixture.
   - Kết luận đúng: phải **gỡ khỏi đồ thị phụ thuộc runtime** (xóa import
     top-level, chuyển fixture sang thư mục test), không phải chỉ tắt cờ.
     Nghiệm thu bằng grep bundle mới, không bằng giá trị biến môi trường.
2. **Không thiếu endpoint nào.** Cả 31 đường API frontend gọi đều có
   controller thật. Không phát sinh việc backend.
3. **15 hàm sync trả mock là code chết** — không component, không service,
   không cả test nào gọi. Xóa được ngay, rủi ro gần như bằng 0.

## Bảng đối chiếu service ↔ endpoint

| Service | Endpoint thật đang gọi | Backend | Dữ liệu ảo còn lại |
|---|---|---|---|
| `authService` | `/auth/login`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/session/refresh`, `/auth/me`, `/auth/me/profile`, `/auth/logout` | ✅ đủ | Không |
| `auditLogService` | `/admin/audit-log` | ✅ | Nhánh `useDemoData` → `mockAuditLogs` (`:65-73`) |
| `clubService` | `/admin/clubs` (GET/POST), `/admin/clubs/{id}` (PATCH/DELETE) | ✅ | Nhánh demo + **code chết** `list()`, `getById()` |
| `clubStatsService` | `/admin/clubs/stats`, `/admin/clubs/{id}/stats` | ✅ | Nhánh demo + `buildMockSummary()`, `buildMockLast30Days()` |
| `eventService` | `/events`, `/events/{id}`, `/events/{id}/status`, `/events/mine`, `/ticketing/events/availability` | ✅ | Nhánh demo + **code chết** `list()`, `listByClub()`, `getById()`, `save()` |
| `registrationService` | `/reservations`, `/reservations/me`, `/reservations/pending`, `/reservations/{id}/approve`, `/reservations/{id}/reject` | ✅ | Nhánh demo + **code chết** `list()`, `listByStudent()`, `listByEvents()`, `save()` |
| `statisticsService` | `/admin/stats`, `/events/stats`, `/ticketing/stats` | ✅ | Không |
| `dashboardService` | `/ticketing/dashboard/club`, `/ticketing/events/{id}/dashboard` | ✅ | Không |
| `ticketService` | `/reservations/me`, `/ticketing/events/{id}/attendees`, `.../attendees.csv`, `/ticketing/events/{id}/availability`, `/ticketing/check-in` | ✅ | Nhánh demo + **code chết** `list()`, `listByStudent()`, `listByEvents()`, `save()` |
| `userService` | `/admin/users`, `/admin/users/{id}/verify-mssv`, `/admin/organizers` (GET/POST), `/admin/organizers/{id}` (DELETE), `/admin/organizers/{id}/lock` | ✅ | Nhánh demo + **code chết** `listOrganizers()` |

## Cần xóa

| Hạng mục | Đường dẫn | Rủi ro |
|---|---|---|
| 6 file fixture | `frontend/src/data/mock{AuditLogs,Clubs,Events,Reservations,Tickets,Users}.ts` | Thấp — chỉ service import |
| 15 hàm sync trả mock | 7 service kể trên | **Gần 0** — không nơi nào gọi |
| Nhánh `if (apiConfig.useDemoData)` / `withXFallback()` | 7 service | Trung bình — phải chắc mọi lời gọi còn đúng chữ ký |
| `DemoDataBadge` | `components/common/DemoDataBadge.tsx` + dùng ở `SuperAdminDashboard.tsx:118`, `SuperAdminLogsPage.tsx:121` | Thấp |
| Cờ `VITE_USE_DEMO_DATA`, `VITE_ENABLE_MOCK_FALLBACK` | `lib/env.ts:26-27,51-58`, `services/apiClient.ts:2`, `.env.example`, `Dockerfile:8-9,17-18`, `compose.monolith.yml:77-78`, `production/compose.yaml:38-39`, `ci.yml:112-113`, `EnvConfigErrorScreen.tsx:38-39` | Trung bình — đụng cả CI và compose |
| Test bám demo mode | `services/__tests__/*.test.ts` (các ca `stubEnv(..., "true")`) | Thấp — xóa ca demo, giữ ca API thật |
| Demo OTP backend (tùy chọn) | `auth/otp/DemoOtpProperties.java`, `FixedOtpCodeIssuer.java`, nhánh trong `ProductionSecretsValidator.java` | Trung bình — `@Profile({"dev","test"})`, prod không dùng; xóa sẽ mất OTP cố định khi dev |

## Hai endpoint backend frontend không gọi

Không phải lỗi, nhưng nên chốt:

- `PATCH /api/admin/clubs/{clubId}/activate` — reactivate club. Frontend
  **không có** nút này (chỉ có deactivate). Liên quan trực tiếp tới H7/H8
  trong `backend/docs/AUTH_OTP_FIX_CHECKLIST_VI.md`: kịch bản "reactivate →
  organizer đăng nhập lại" hiện chỉ thao tác được bằng API trực tiếp.
- `GET /api/admin/events` — `SuperAdminEventsPage.tsx` dùng
  `clubService.listRemote()` rồi drill-down theo club, nên endpoint này không
  ai gọi. Có vẻ là quyết định UI có chủ đích; xác nhận rồi hoặc bỏ endpoint
  hoặc dùng lại.

## Đề xuất thứ tự

1. Xóa 15 hàm sync chết + 6 file fixture (một commit, không đổi hành vi).
2. Gỡ nhánh demo trong 7 service, để mọi lời gọi đi thẳng API.
3. Gỡ `DemoDataBadge` + hai cờ env khỏi code, `.env.example`, Dockerfile,
   compose (dev/prod), CI.
4. Dọn test bám demo mode.
5. Quyết định riêng: demo OTP backend và hai endpoint mục trên.
6. Gate: `cd frontend && npm run lint && npm test && npm run build`.
