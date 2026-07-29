# Xác minh báo cáo lỗi Frontend — TVU Event Ticket (vòng kiểm tra sau khi sửa 2026-07-28)

Ngày kiểm tra: 2026-07-29
Phạm vi: đối chiếu trực tiếp mã nguồn hiện tại (`frontend/src`) và các file backend liên quan (`ticket/dto`, `event/dto`), cùng bản build production thực tế (`npm run build`, `npm run lint`).

Chú thích: ✅ Xác nhận đúng · ❌ Không xác nhận được / đã được sửa từ trước

---

## CAO

### 1. Camera QR có thể gửi lặp cùng một mã
**✅ Xác nhận đúng — lỗi thật, mức Cao**

- `QRScannerPanel.tsx:78-84`: `isProcessingRef.current` được set `true` ngay trước khi gọi `onCheckIn`, nhưng được set lại `false` ngay trong `.then()` khi request **hoàn tất** (dù thành công hay thất bại) — không có điều kiện chờ QR rời khỏi khung hình. Vòng `requestAnimationFrame` (dòng 69-88) chạy liên tục không dừng, nên nếu QR vẫn nằm trong khung hình ở lần vẽ frame tiếp theo, `jsQR` sẽ decode ra cùng chuỗi và `onCheckIn` bị gọi lại ngay lập tức.
- `OrganizerScanPage.tsx:76-84` (`handleCheckIn`): là hàm nội tuyến được tạo mới mỗi lần component render (không bọc `useCallback`), và được truyền vào `QRScannerPanel` làm prop `onCheckIn` — nằm trong dependency array của `useEffect` mở camera (`QRScannerPanel.tsx:97`: `[cameraPermission, onCheckIn]`). Do `handleCheckIn` cập nhật `tickets`/`scanHistory` sau mỗi lần quét (dòng 79, 88-92 của `OrganizerScanPage.tsx`), `OrganizerScanPage` re-render → `handleCheckIn` có identity mới → effect camera trong `QRScannerPanel` unmount/remount (dừng stream cũ, xin stream mới) sau **mỗi lần quét thành công hoặc thất bại**.
- Hậu quả đúng như mô tả: yêu cầu check-in đầu tiên có thể thành công, yêu cầu lặp lại ngay sau đó (trong lúc QR còn trong khung hình) sẽ nhận lỗi "vé đã check-in"; lịch sử quét bị lấp cùng một mã; camera nhấp nháy/xin lại quyền; tăng tải API không cần thiết trong giờ cao điểm check-in.
- **Kết luận**: đúng, mức **Cao** — cần thêm cơ chế cooldown/dedup theo mã vừa quét và chỉ cho phép quét lại khi giá trị decode thay đổi (hoặc khung hình không còn phát hiện QR), đồng thời bọc `handleCheckIn` bằng `useCallback` để effect camera không bị re-mount sau mỗi lần quét.

### 2. Mock data vẫn bị đóng gói vào production
**✅ Xác nhận đúng — chỉ mới xử lý một phần**

- `auditLogService.ts:1`, `userService.ts:1`, `registrationService.ts:1`, `clubService.ts:1`, `eventService.ts:1`, `ticketService.ts:1`, `clubStatsService.ts:1-3` đều import tĩnh (`import { mockX } from "../data/mockX"`) — không có nhánh dynamic `import()`, nên bundler đưa toàn bộ dữ liệu fixture vào bundle production bất kể `apiConfig.useDemoData`.
- Build thực tế (`npm run build`) xác nhận `dist/assets/mockClubs-*.js`, `mockEvents-*.js`, `mockTickets-*.js` tồn tại thành chunk riêng; nội dung `mockUsers.ts` (email/MSSV mẫu) và `mockAuditLogs.ts` (tên người dùng mẫu, IP `172.16.12.44`, hành động) được inline thẳng vào `dist/assets/userService-*.js` và `dist/assets/auditLogService-*.js`.
- Chuỗi tài khoản cá nhân từng xuất hiện trong fixture đã được loại bỏ ở lần sửa trước — xác nhận **không còn** trong bundle. Tuy nhiên đây chỉ là phần dữ liệu nhạy cảm nhất, còn kiến trúc gốc (mock data luôn nằm trong production bundle) chưa được xử lý tại thời điểm báo cáo.
- **Kết luận**: đúng, mức **Cao** — cần chuyển các import mock sang `dynamic import()` bên trong nhánh `useDemoData`, hoặc tách mock data khỏi các service production hoàn toàn (ví dụ dùng MSW/fixture riêng cho môi trường dev/test).

---

## TRUNG BÌNH

### 3. Ghi chú đăng ký (note) vẫn không được lưu
**✅ Xác nhận đúng**

- Frontend đã sửa để gửi `note` trong body (`registrationService.ts:81-89`), nhưng `CreateReservationRequest.java:7-8` (backend) chỉ có duy nhất field `@NotNull UUID eventId` — không có field `note` nào để Spring bind vào. Vì Spring Boot mặc định bỏ qua field JSON không xác định (`FAIL_ON_UNKNOWN_PROPERTIES=false`), request vẫn thành công (HTTP 200) nhưng nội dung sinh viên nhập bị lặng lẽ loại bỏ.
- **Kết luận**: đúng, mức **Trung bình** — đây là giới hạn phía backend (thiếu field), sửa frontend một mình không đủ để đóng finding này; cần bổ sung `note` vào `CreateReservationRequest`, domain `Reservation`, và migration DB.

### 4. Banner sự kiện vẫn không được lưu
**✅ Xác nhận đúng**

- Frontend đã sửa để gửi `bannerUrl` (`eventService.ts:65-76`), nhưng `EventRequest.java:6-14` không có field `bannerUrl`, và `EventResponse.java:7-10` cũng không trả về field này khi đọc lại. Do đó sau khi tạo/sửa sự kiện hoặc tải lại trang, banner luôn hiển thị rỗng/ảnh mặc định.
- **Kết luận**: đúng, mức **Trung bình** — cùng nguyên nhân gốc với #3, cần backend bổ sung field `bannerUrl` vào domain `Event`, `EventRequest`, `EventResponse` và migration.

### 5. Nhiều trang vẫn biến lỗi API thành dữ liệu rỗng hoặc số 0
**✅ Xác nhận đúng cả 5 trang**

- `StudentHomePage.tsx:25-49`: không có `isLoading`/state lỗi riêng; khi `Promise.all` (events/reservations/tickets) reject, catch chỉ hiện toast — 3 mảng state vẫn giữ giá trị khởi tạo `[]`, khiến các `StatisticCard` hiện "0" và các khối "Bạn chưa gửi đăng ký nào."/"Chưa có vé được cấp." y hệt trường hợp thật sự chưa có dữ liệu.
- `MyRegistrationsPage.tsx:20-33`: cùng mẫu hình — lỗi API chỉ hiện toast, `reservations` giữ `[]`, `EmptyState` "Không có đăng ký nào" hiển thị dù có thể chỉ là lỗi tải.
- `StudentHistoryPage.tsx:18-35`: có `isLoading` nhưng không có state lỗi riêng biệt; sau khi `finally` set `isLoading=false`, nếu lỗi xảy ra thì `reservations` vẫn `[]` → hiển thị "Chưa có sự kiện nào trong lịch sử" giống hệt trường hợp thật sự trống.
- `OrganizerDashboard.tsx:33-56`: `dashboardService.clubDashboard().catch(() => null)` — nếu riêng lời gọi này lỗi, `clubDashboard` là `null`, kéo theo `approvedCount`/`checkedInCount` mặc định về `0` (dòng 59-60) mà không có cảnh báo phân biệt với "thật sự bằng 0".
- `OrganizerEventDetailPage.tsx:34-54`: nếu cả `dashboardService.eventDashboard()` và fallback `ticketService.listAttendees()` đều lỗi, `attendeesFallback` thành `[]`, khiến `stats.approved`/`stats.checkedIn` (dòng 60-70) về `0` không kèm cảnh báo.
- **Kết luận**: đúng cả 5 trang, mức **Trung bình** — cần tách rõ 3 trạng thái: đang tải / trống thật sự / lỗi tải (không đưa dữ liệu về `0`/`[]` một cách không phân biệt).

### 6. Ví vé hứa hiển thị QR nhưng production không thể lấy lại QR
**✅ Xác nhận đúng (giới hạn kiến trúc backend, không chỉ là lỗi UI)**

- `MyTicketsPage.tsx:100-103` và `EventRegistrationResultPage.tsx` đều mô tả QR "tự động hiển thị" trong Ví vé.
- `ticketService.ts` (`mapReservationTicket`) dựng `Ticket` từ `/reservations/me`, nhưng `ReservationResponse.java:8-23` (backend) **không có field nào chứa QR payload đã ký** — chỉ có `ticketId`. Vì vậy `qrCodeValue` trong `Ticket` luôn là `undefined` khi chạy với backend thật, và `QRDisplayCard` luôn rơi vào nhánh "chưa có QR, kiểm tra email" — QR không bao giờ thực sự tự hiển thị trong production như văn bản hứa hẹn.
- Bản sửa trước đã làm cho câu chữ trong `MyTicketsPage.tsx` không còn *mâu thuẫn trực tiếp* với `QRDisplayCard`/`EventRegistrationResultPage` (không còn hai câu khẳng định trái ngược nhau), nhưng lời hứa "QR tự động hiển thị" vẫn là hứa hẹn không bao giờ thành hiện thực với dữ liệu backend hiện tại.
- **Kết luận**: đúng, mức **Trung bình** — cần bổ sung QR payload đã ký vào `ReservationResponse` (hoặc endpoint riêng) để lời hứa trên UI có cơ sở, thay vì chỉ sửa câu chữ.

### 7. Dialog và Drawer vẫn chưa hoàn chỉnh về accessibility
**✅ Xác nhận đúng cả 4 điểm**

- `ConfirmModal.tsx:42-63`: gọi `<Dialog isOpen onClose footer>` nhưng **không truyền `title`** — `Dialog.tsx:69` chỉ set `aria-labelledby` khi có `title`, nên mọi `ConfirmModal` (dùng ở rất nhiều trang) có `role="dialog"` nhưng không có accessible name cho screen reader.
- `Dialog.tsx`: focus ban đầu đặt vào `panelRef` (container, `tabIndex={-1}`) — phần tử này không khớp `FOCUSABLE_SELECTOR` nên không nằm trong danh sách focus-trap. Khi người dùng nhấn Shift+Tab ngay sau khi dialog mở (trước khi tab vào nội dung), `document.activeElement` là container chứ không phải `first`, điều kiện trap không khớp, trình duyệt chuyển focus theo thứ tự DOM lùi về **nút backdrop** (dòng 64, nằm ngoài `panelRef`) — về mặt kỹ thuật đã thoát khỏi vùng `role="dialog"`. Tiếp tục Shift+Tab từ đó sẽ thoát hẳn ra nội dung phía sau dialog.
- `DetailDrawer.tsx:19-38`: hoàn toàn không có `role="dialog"`, `aria-modal`, xử lý phím Escape, focus trap, khôi phục focus khi đóng, và nút đóng (dòng 25-30) không có `aria-label` (chỉ có icon `X`).
- `EventFilter.tsx` (label "Từ khóa tìm kiếm"/"Trạng thái đăng ký") và ô "Nhập mã vé thủ công" trong `QRScannerPanel.tsx:166-179`: label vẫn là `<label>` không có `htmlFor`, input/select tương ứng không có `id`.
- **Kết luận**: đúng cả 4 điểm, mức **Trung bình**.

---

## THẤP

### 8. Mã CLB vẫn là dữ liệu frontend tự dựng
**✅ Xác nhận đúng — đúng như đã ghi nhận khi sửa**

- `clubService.ts:22-24` (`deriveClubCode`) lấy 8 ký tự cuối của `id` (đã thay cho cách cắt tên cũ) làm mã CLB. Đây là cải thiện so với bản trước (không còn trùng do tên giống nhau, không bị ảnh hưởng bởi dấu/khoảng trắng tiếng Việt), nhưng **vẫn là giá trị tự dựng phía client**, vì `ClubResponse` (backend) không có field mã CLB nghiệp vụ.
- **Kết luận**: đúng, mức **Thấp** — đã là biện pháp giảm thiểu tốt nhất có thể ở frontend; muốn giải quyết dứt điểm cần backend cấp mã CLB chính thức.

### 9. Thiếu test cho các luồng quan trọng
**✅ Xác nhận đúng**

- Xác nhận không tồn tại file test cho: `QRScannerPanel`, `OrganizerScanPage`, `EventForm`, `EventRegistrationConfirmPage`, `registrationService` (thư mục `__tests__` tương ứng không tồn tại hoặc không có file này). 14 test file hiện có (69 test) đều pass nhưng không phủ các luồng trên.
- **Kết luận**: đúng, mức **Thấp** — nên bổ sung test, đặc biệt cho hành vi dedup/cooldown của #1 một khi được sửa, để tránh regression.

### 10. Cấu hình API production chưa fail-closed
**✅ Xác nhận đúng, rủi ro thực tế thấp**

- `env.ts:28` và `apiClient.ts:1-3` đều fallback về `http://localhost:8080/api` khi thiếu `VITE_API_BASE_URL`. `validateAppEnv()` (`env.ts:30-63`) kiểm tra `devstub` ở production (lỗi chặn) và `useDemoData`/`legacyMockFallbackConfigured` ở production (chỉ cảnh báo), nhưng **không có bất kỳ kiểm tra nào** cho việc thiếu `VITE_API_BASE_URL`.
- `docker-compose.monolith.yml:74` (đường triển khai chính thức) có truyền `VITE_API_BASE_URL: /api` ở build-time, nên rủi ro thực tế chỉ xảy ra khi build thủ công hoặc qua pipeline CI/CD khác không set biến này.
- **Kết luận**: đúng, mức **Thấp** — nên thêm kiểm tra "production nhưng thiếu `VITE_API_BASE_URL`" vào `validateAppEnv()` như một `errors` (fail-closed) thay vì im lặng dùng localhost.

### 11. Cảnh báo lint useEffect dependency
**✅ Xác nhận đúng — lỗi phát sinh từ lần sửa #13 (giữ URL đích khi redirect login)**

- `npm run lint` (oxlint) báo: `src/pages/public/LoginPage.tsx:46:28: react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'resolveDestination'`.
- Nguyên nhân: `useEffect` xử lý callback OAuth (dòng 30-51) gọi `resolveDestination(user.role)` nhưng dependency array (dòng 51) chỉ có `[location.pathname, location.search, navigate]`, thiếu `resolveDestination`.
- **Kết luận**: đúng, mức **Thấp** — nên bọc `resolveDestination` bằng `useCallback` hoặc thêm vào dependency array để hết cảnh báo (không có bug chức năng vì `resolveDestination` không đổi identity theo cách ảnh hưởng logic, nhưng cảnh báo lint là có thật).

### 12. Favicon khai báo sai MIME cho file .webp
**❌ Không xác nhận được — đã đúng trong trạng thái hiện tại**

- `index.html:5-9` hiện tại: `<link rel="icon" type="image/webp" href="/logo-tvu.webp" />` — MIME `image/webp` khớp đúng với đuôi file `.webp`. File `public/logo-tvu.webp` tồn tại.
- `git diff` cho thấy đây là một thay đổi **chưa commit** đổi từ `type="image/jpeg" href="/tvu_logo_1783065060265.jpg"` (bản cũ, đúng là sai MIME nếu đứng cạnh file webp) sang cặp mới nhất quán `image/webp` + `.webp`. Có thể finding này được ghi nhận từ một thời điểm trung gian (sau khi đổi tên file nhưng trước khi cập nhật MIME) và đã được khắc phục trước khi tôi kiểm tra lại.
- **Kết luận**: không xác nhận được lỗi trong mã nguồn hiện tại — không cần hành động thêm cho mục này.

---

## Tổng kết

| # | Mức độ báo cáo | Kết quả xác minh |
|---|---|---|
| 1 | Cao | ✅ đúng — cần dedup/cooldown quét QR + `useCallback` cho `handleCheckIn` |
| 2 | Cao | ✅ đúng — mock data vẫn trong bundle, chỉ email cá nhân đã được xử lý |
| 3 | Trung bình | ✅ đúng — backend thiếu field `note` |
| 4 | Trung bình | ✅ đúng — backend thiếu field `bannerUrl` |
| 5 | Trung bình | ✅ đúng cả 5 trang |
| 6 | Trung bình | ✅ đúng — backend thiếu QR payload trong `ReservationResponse` |
| 7 | Trung bình | ✅ đúng cả 4 điểm (ConfirmModal, Dialog focus trap, DetailDrawer, label liên kết) |
| 8 | Thấp | ✅ đúng — giới hạn đã biết, đã là mitigation tốt nhất phía frontend |
| 9 | Thấp | ✅ đúng — thiếu test cho 5 mục |
| 10 | Thấp | ✅ đúng, rủi ro thấp nhờ compose chính thức đã set biến |
| 11 | Thấp | ✅ đúng — cảnh báo lint có thật, phát sinh từ lần sửa trước |
| 12 | Thấp | ❌ không xác nhận — mã nguồn hiện tại đã đúng |

**11/12 mục được xác nhận đúng với mã nguồn thực tế.** Đáng chú ý: các mục #3, #4, #6 đều có cùng nguyên nhân gốc — **backend chưa có field tương ứng** (`note`, `bannerUrl`, QR payload trong reservation) — nên các finding này không thể đóng hoàn toàn chỉ bằng thay đổi frontend, cần phối hợp sửa backend (domain, DTO request/response, migration DB). Mục #1 (Cao) là lỗi thật phát sinh từ lần triển khai camera QR thật trước đó và cần được ưu tiên sửa ngay vì ảnh hưởng trực tiếp đến quy trình check-in thực tế.
