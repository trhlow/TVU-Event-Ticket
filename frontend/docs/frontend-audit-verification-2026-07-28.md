# Xác minh báo cáo lỗi Frontend — TVU Event Ticket (bản cập nhật lần 3)

Ngày kiểm tra: 2026-07-28 (cập nhật lần 3 — bổ sung 9 phát hiện mới về luồng đăng ký/vé QR/accessibility)
Phạm vi: `frontend/src` đối chiếu trực tiếp mã nguồn hiện tại + `backend/monolith/.../SecurityConfig.java`, `EventService.java`, `TicketReservationService.java` phía backend.

Chú thích: ✅ Xác nhận đúng · ⚠️ Xác nhận một phần · ❌ Không xác nhận được / không đúng

---

## CRITICAL

**Không có lỗi Critical được xác nhận** — đồng ý với đánh giá này. Chi tiết ở mục 1 bên dưới.

---

## CAO

### 1. Mock data vẫn nằm trong production bundle
**✅ Xác nhận đúng** — chưa nâng Critical

- `userService.ts:1` import tĩnh `mockUsers` từ `mockUsers.ts` → bị đóng gói vào bundle production bất kể `apiConfig.useDemoData` (cờ chỉ quyết định có *chạy* code đó hay không tại runtime, không loại code khỏi bundle qua tree-shaking vì các hàm export vẫn tham chiếu tới `mockUsers` một cách vô điều kiện).
- `mockUsers.ts:8` từng chứa một địa chỉ tài khoản cá nhân trong fixture.
- **Kết luận**: giữ mức **Cao**. Toàn bộ các bản ghi còn lại (MSSV, tên, IP audit log) là dữ liệu demo dàn dựng, không phải người dùng thật. Riêng tài khoản cá nhân phải được loại bỏ hoàn toàn, kể cả khi chỉ là seed test; bản thân việc này không đủ căn cứ để nâng toàn bộ finding lên Critical vì phần dữ liệu còn lại không phải PII thật.

### 2. Camera QR chỉ là giao diện mô phỏng
**✅ Xác nhận đúng hoàn toàn**

- `OrganizerScanPage.tsx:63`: `await navigator.mediaDevices.getUserMedia({ video: true })` rồi ngay dòng kế `stream.getTracks().forEach((track) => track.stop())` — xin quyền xong đóng ngay, không giữ stream.
- Không có `<video>` element, không có `BarcodeDetector`, không có thư viện giải mã QR nào trong `QRScannerPanel.tsx`.
- `QRScannerPanel.tsx:150`: `onClick={() => handleScanSubmit(t.ticketCode)}` — gửi `ticketCode` (= `response.id` theo `mapTicket`), không phải QR payload đã ký (`qrCodeValue` — field tồn tại riêng, được dùng để so khớp ở nhánh demo fallback của `ticketService.checkIn`).
- **Kết luận**: đúng, mức **Cao**.

### 3. Sửa sự kiện làm lệch thời gian 7 giờ
**✅ Xác nhận đúng**

- `EventForm.tsx:45`: `new Date(initialData.startAt).toISOString().slice(0, 16)` đưa giá trị UTC vào `<input type="datetime-local">`, trong khi input này được trình duyệt diễn giải theo giờ địa phương. Với giờ VN (UTC+7), giá trị hiển thị bị lệch 7 giờ so với thực tế, và khi lưu lại (`toInstant` → `new Date(value).toISOString()`), giá trị bị dịch chuyển thêm một lần nữa theo chiều ngược lại.
- **Kết luận**: đúng, mức **Cao**.

### 4. /complete-profile làm crash ứng dụng khi chưa đăng nhập
**✅ Xác nhận đúng**

- `AppRoutes.tsx:80`: route `/complete-profile` nằm trong nhóm Public, không có `<ProtectedRoute>`.
- `CompleteProfilePage.tsx:12`: gọi `requireCurrentUser()` ngay trong thân component — hàm này throw nếu chưa có user.
- Không tìm thấy `ErrorBoundary`/`componentDidCatch` nào trong toàn bộ `src` → lỗi throw sẽ làm React unmount toàn cây, màn hình trắng.
- **Kết luận**: đúng, mức **Cao**.

### 5. Phiên hết hạn không đưa người dùng về trang đăng nhập
**✅ Xác nhận đúng — phát hiện mới hợp lệ**

- `ProtectedRoute.tsx:20-33` (`restoreSession`): nếu `isAuthenticated() && cachedUser` đã true (tức đã từng đăng nhập thành công trước đó trong phiên trình duyệt), component **tin tưởng hoàn toàn cache cục bộ** và **không gọi lại `authService.me()` để xác thực với server** mỗi lần route được mount. Chỉ khi cache trống mới có gọi `authService.me()` và mới có nhánh `setCurrentUser(null)` khi lỗi không phải network (dòng 49).
- `apiClient.ts:76-88`: khi một request bất kỳ nhận `401`, code thử gọi `/auth/session/refresh` một lần (`tryRefreshSession`). Nếu refresh **thất bại** (trả `false`), code chỉ `throw await createApiError(response)` — **không có bất kỳ lệnh gọi `setCurrentUser(null)` hay điều hướng nào** ở đây.
- Đã grep toàn bộ `src` cho `setCurrentUser(null)`: chỉ xuất hiện ở `ProtectedRoute.tsx:49` (chỉ chạy khi chưa có cache) và `authService.ts:147` (hàm logout). Không có nơi nào xử lý logout tự động khi request thường (ngoài lúc mount ban đầu) trả 401 sau khi refresh thất bại.
- Hệ quả đúng như mô tả: người dùng đã đăng nhập trước đó, khi phiên hết hạn thật sự (VD sau khi hết 15 phút — xem mục 6), vẫn tiếp tục thấy giao diện trang được bảo vệ, chỉ có các lời gọi API riêng lẻ trả lỗi 401 (hiện dưới dạng toast lỗi tuỳ trang), không bị đưa về `/login`.
- **Kết luận**: đúng, mức **Cao** — đây là lỗ hổng UX/bảo mật thật (người dùng có thể thao tác trên dữ liệu cũ trong giao diện tưởng như còn hiệu lực).

---

## TRUNG BÌNH (bổ sung lần 3 — luồng đăng ký/QR/accessibility)

### 19. Có thể đăng ký ngoài thời gian cho phép
**✅ Xác nhận đúng**

- `StudentEventDetailPage.tsx` (khối `event.status === "OPEN" && !isSoldOut ? (...)`, gần dòng 195): điều kiện hiện nút "Đăng ký vé tham dự" chỉ kiểm tra `event.status === "OPEN"` và còn vé, **không** so sánh `event.registrationOpenAt`/`registrationCloseAt` với thời gian hiện tại.
- `EventRegistrationConfirmPage.tsx:78`: `if (event.status !== 'OPEN') { showToast(...); return; }` — cũng chỉ kiểm tra `status`, không có điều kiện nào đối chiếu cửa sổ thời gian đăng ký.
- Đối chiếu backend: `EventService.java:102-106` (`getPublic`) chỉ lọc theo `status == OPEN`, không kiểm tra cửa sổ thời gian khi trả về **một** sự kiện theo id (khác với `listPublic()` dòng 96-100, có lọc `registrationOpenAt <= now <= registrationCloseAt` khi trả **danh sách**). Do đó truy cập trực tiếp bằng ID (link/QR) có thể trả về sự kiện dù đã ngoài cửa sổ đăng ký, miễn `status` DB vẫn là `OPEN`.
- `TicketReservationService.java:246-247`: `if (!"OPEN".equals(event.status()) || now.isBefore(event.registrationOpenAt()) || now.isAfter(event.registrationCloseAt()))` → backend **có** kiểm tra và từ chối khi submit ngoài cửa sổ — khớp chính xác với mô tả "backend từ chối khi submit".
- **Kết luận**: đúng, mức **Trung bình** — không gây sai lệch dữ liệu nhưng gây trải nghiệm xấu (sinh viên điền form, bấm gửi rồi mới bị từ chối).

### 20. Lỗi tải lịch sử đăng ký bị hiểu thành "chưa đăng ký"
**✅ Xác nhận đúng**

- `StudentEventDetailPage.tsx:34`: `registrationService.listByStudentRemote(currentUser.id).catch(() => [] as Reservation[])` — mọi lỗi (mất mạng, lỗi 500, v.v.) khi tải lịch sử đăng ký đều bị nuốt và thay bằng mảng rỗng.
- Hệ quả: `existingReservation` luôn là `undefined` khi API lỗi → trang hiển thị y hệt như khi sinh viên thật sự chưa đăng ký (nút "Đăng ký vé tham dự"), không có cảnh báo "không xác định được trạng thái đăng ký".
- **Kết luận**: đúng, mức **Trung bình**.

### 21. Nhiều trang biến lỗi API thành dữ liệu rỗng hoặc số 0
**✅ Xác nhận đúng cả 3 dẫn chứng**

- `OrganizerTicketsPage.tsx:38`: `ticketService.listAttendees(event.id).catch(() => [] as Ticket[])` — lỗi tải vé của một sự kiện cụ thể trong club bị nuốt âm thầm, danh sách vé tổng hợp hiển thị thiếu mà không có cảnh báo nào cho biết có sự kiện đã tải lỗi.
- `EventRegistrationResultPage.tsx:24-26`: `.catch(() => { if (mounted) setReservation(null); })` — lỗi mạng khi tải lại đơn đăng ký theo id bị xử lý giống hệt "không tìm thấy", hiển thị thông báo "Không tìm thấy đơn đăng ký này trong tài khoản của bạn" dù đơn có thể vẫn tồn tại, chỉ là API lỗi tạm thời.
- `MyTicketsPage.tsx`: trang này **không có state `isLoading`** riêng — `tickets` khởi tạo là mảng rỗng và điều kiện render `tickets.length > 0 ? (...) : <EmptyState .../>` chạy ngay từ lần render đầu tiên, nên trong lúc đang tải (trước khi promise `ticketService.listRemote()` hoàn tất) hoặc khi tải lỗi, người dùng thấy ngay "Ví vé của bạn đang trống" thay vì trạng thái loading hoặc lỗi rõ ràng (dù có `showToast` báo lỗi kèm theo ở nhánh catch, tối thiểu UI chính vẫn hiển thị "trống" chứ không phải "đang tải" hay "lỗi tải dữ liệu").
- **Kết luận**: đúng cả 3 dẫn chứng, mức **Trung bình**. (Phần "Student Dashboard" không có trích dẫn file:line cụ thể trong báo cáo gốc nên không kiểm tra riêng, nhưng mẫu hình lỗi giống hệt đã được xác nhận lặp lại ở 3 nơi khác trong cùng nhóm chức năng sinh viên.)

### 22. Thông báo về QR vé mâu thuẫn
**✅ Xác nhận đúng, mâu thuẫn rõ ràng**

- `EventRegistrationResultPage.tsx:114-117`: *"Mã vé QR sẽ tự động hiển thị trong mục "Ví vé" ngay khi Ban tổ chức CLB phê duyệt phiếu đăng ký của bạn."*
- `MyTicketsPage.tsx:83-87` (banner thông tin) và `QRDisplayCard.tsx:38-41` (khi `!hasQrPayload`): *"Mã QR đã được gửi qua email khi vé được duyệt. Trang này chưa hỗ trợ hiển thị lại mã QR — vui lòng kiểm tra hộp thư của bạn."*
- Hai thông điệp mâu thuẫn trực tiếp: trang xác nhận đăng ký hứa hẹn QR "tự động hiện" trong Ví vé, nhưng Ví vé lại khẳng định "chưa hỗ trợ hiển thị lại" và yêu cầu kiểm tra email. Rủi ro thực tế: sinh viên tin theo thông báo đầu, không lưu email, đến sự kiện không có QR để check-in.
- **Kết luận**: đúng, mức **Trung bình**.

### 23. Bộ lọc trạng thái sự kiện có nhiều lựa chọn không bao giờ có dữ liệu
**✅ Xác nhận đúng (đối chiếu backend)**

- `EventFilter.tsx:58-63`: `<select>` có các option `OPEN`, `UPCOMING`, `CLOSED`, `FULL`, `ENDED`.
- `StudentEventListPage.tsx:46`: `matchStatus = selectedStatus === 'ALL' || evt.status === selectedStatus` — so khớp trực tiếp với field `status` trả về từ API public.
- `EventService.java:96-100` (`listPublic`): chỉ trả về sự kiện có `status == EventStatus.OPEN` **và** đang nằm trong khoảng `registrationOpenAt <= now <= registrationCloseAt`. Vì vậy dữ liệu nhận về từ API public **không bao giờ chứa** giá trị `status` nào khác ngoài `OPEN`.
- Hệ quả: chọn `UPCOMING`, `CLOSED`, `FULL`, hoặc `ENDED` trong bộ lọc sẽ luôn cho ra danh sách rỗng, vì trường `status` trong dữ liệu nguồn không bao giờ mang các giá trị đó.
- **Kết luận**: đúng, mức **Trung bình**.

### 24. Label và lỗi validation chưa liên kết với form control
**✅ Xác nhận đúng cả 3 dẫn chứng — lỗi accessibility riêng biệt với Dialog (mục 10)**

- `EventForm.tsx:20` (`FieldLabel`): `<label className="...">{children}</label>` — không có `htmlFor`; các `<Input>`/`<textarea>` tương ứng (title, description, location, ngày giờ, capacity) không có `id` để liên kết. `FieldError` (dòng 15-18) chỉ render `<p>` chứa thông báo lỗi, không gắn `aria-describedby` trỏ tới từ input, input lỗi cũng không có `aria-invalid="true"`.
- `StudentProfileForm.tsx:71-72, 82, 96`: các label "Họ và tên", "Mã số sinh viên (MSSV)", "Lớp học sinh hoạt" đều không có `htmlFor`; `<Input>` tương ứng không có `id`. `errorMsg` (dòng 64-68) hiển thị thông báo lỗi chung, không gắn với field cụ thể nào qua `aria-describedby`.
- `LoginPage.tsx` (khối input mã OTP, quanh dòng 174-185): input OTP hoàn toàn **không có `<label>`** đi kèm (chỉ có `placeholder`), khác với input email phía trên có `<label htmlFor="login-email">` đúng chuẩn.
- **Kết luận**: đúng cả 3 dẫn chứng, mức **Trung bình**. Đây đúng là lỗi khác, bổ sung thêm cho lỗi Dialog (mục 10) đã ghi nhận ở bản trước, không trùng lặp.

---

## TRUNG BÌNH (đã xác nhận ở các lần kiểm tra trước)

### 6. rememberDevice luôn false → phiên admin hết sau 15 phút
**✅ Xác nhận đầy đủ (mới xác nhận được con số 15 phút)**

- `LoginPage.tsx:87`: `authService.verifyOtp(adminEmail, otpCode, false)` — tham số rememberDevice hard-code `false`, không có UI nào để bật.
- `apiClient.ts:76-79` (comment ngay trong code): *"A remembered admin browser holds a device cookie but only a 15-minute session."* — xác nhận trực tiếp bằng chú thích của chính codebase rằng phiên (không có device cookie ghi nhớ) chỉ kéo dài 15 phút trước khi cần refresh.
- **Kết luận**: đúng, mức **Trung bình** (giữ nguyên, không cần backend xác minh thêm như lần trước — dòng comment trong `apiClient.ts` đã đủ căn cứ).

### 7. Ghi chú đăng ký bị loại bỏ trước khi gửi API
**✅ Xác nhận đúng** — `EventRegistrationConfirmPage.tsx:110` build field `note`, nhưng `registrationService.ts:81-96` (`submit`) chỉ nhận `Pick<Reservation, "eventId">` và gửi `{ eventId }` — note bị bỏ.

### 8. API availability lỗi → UI giả định còn toàn bộ vé
**✅ Xác nhận đúng** — `eventService.ts:83-92` (`loadAvailability`) catch lỗi trả về `Map` rỗng; `mapRemoteEvent` dùng `availability?.remaining ?? event.capacity` → mặc định hiển thị đầy đủ capacity khi không có dữ liệu.

### 9. Banner URL không được gửi lên backend
**✅ Xác nhận đúng** — `EventForm.tsx:168` có field, nhưng `EventRequest` interface và `toEventRequest()` trong `eventService.ts` không có `bannerUrl`.

### 10. Dialog/Drawer chưa đáp ứng bàn phím/screen reader
**✅ Xác nhận đúng** — `Dialog.tsx` không có `role="dialog"`, `aria-modal`, xử lý Escape, focus trap, hay khôi phục focus.

### 11. Ma trận RBAC hiển thị sai quyền Super Admin
**✅ Xác nhận đúng (đối chiếu backend)** — `SuperAdminRBACPage.tsx` gán `admin: true` cho quản lý sự kiện/duyệt đăng ký/quét QR, nhưng `SecurityConfig.java` giới hạn các endpoint `/api/events/**`, `/api/reservations/**`, `/api/ticketing/**` cho `hasRole("ORGANIZER")`; SUPER_ADMIN chỉ có quyền trên endpoint thống kê/quản trị.

### 12. Thiếu test cho QR, đăng ký, form sự kiện
**✅ Xác nhận đúng** — không có file test nào cho `QRScannerPanel`, `OrganizerScanPage`, `EventForm`, `EventRegistrationConfirmPage`, `registrationService`.

### 13. QR đăng ký trỏ route bảo vệ, redirect đăng nhập không lưu URL đích
**✅ Xác nhận đúng — phát hiện mới hợp lệ**

- `OrganizerRegistrationQRPage.tsx:42`: `registrationLink` trỏ tới `/student/events/${event.id}/register`, là route yêu cầu vai trò `SINH_VIEN` (`AppRoutes.tsx:92`, bọc trong `<ProtectedRoute allowedRoles={["SINH_VIEN"]}>`).
- `ProtectedRoute.tsx:105`: `if (!currentUser) return <Navigate to="/login" replace />;` — điều hướng **không kèm `state`** lưu lại `location.pathname` gốc.
- Đã kiểm tra `LoginPage.tsx` toàn bộ: sau khi đăng nhập thành công (`handleVerifyOtp`, `handleMicrosoftLogin`, `handleDevStubLogin`) đều gọi `navigate(homePathForRole(user.role), { replace: true })` — luôn về dashboard mặc định theo vai trò, không có logic đọc `location.state?.from` hay tương tự để quay lại URL gốc.
- **Kết luận**: đúng, mức **Trung bình** — sinh viên quét QR đăng ký khi chưa đăng nhập sẽ bị đưa về trang chủ sinh viên thay vì quay lại đúng trang đăng ký sự kiện, gây mất bước.

### 14. Trang sửa sự kiện: tải lỗi gây loading vô hạn; submit lỗi không có thông báo
**✅ Xác nhận đúng — phát hiện mới hợp lệ**

- `OrganizerEditEventPage.tsx:23-42` (`loadEvent`): gọi `await eventService.listByClubRemote(...)` **không có try/catch**. Nếu request lỗi (network, 500, v.v.), promise reject không được bắt, và vì `setIsLoading(false)` chỉ nằm trong nhánh sau `await` thành công, `isLoading` không bao giờ được set lại `false` → màn hình "Đang tải..." treo vĩnh viễn.
- `OrganizerEditEventPage.tsx:69-73` (`handleSubmit`): `await eventService.update(event.id, data)` cũng không có try/catch riêng.
- `EventForm.tsx:87-101` (`handleFormSubmit`): chỉ có `try { await onSubmit(...) } finally { setIsSubmitting(false) }` — **không có `catch`**, nên nếu `onSubmit` (tức `handleSubmit` ở trên) ném lỗi, không toast nào hiển thị, lỗi chỉ trồi lên console dưới dạng unhandled rejection, người dùng không biết vì sao submit "im lặng" không thành công (dù nút loading tắt đúng nhờ `finally`).
- **Kết luận**: đúng, mức **Trung bình**.

---

## THẤP (bổ sung lần 3)

### 25. Mã CLB là dữ liệu tự dựng
**✅ Xác nhận đúng**

- `clubService.ts:22`: `code: response.name.slice(0, 8).toUpperCase()` — mã CLB không phải field riêng từ backend mà được frontend tự suy ra bằng cách cắt 8 ký tự đầu tên CLB.
- Hệ quả đúng như mô tả: hai CLB có tên trùng 8 ký tự đầu sẽ có mã trùng nhau; tên CLB tiếng Việt có dấu/khoảng trắng sẽ lọt thẳng vào mã (không strip dấu, không loại khoảng trắng); đổi tên CLB làm mã đổi theo dù đây là thứ thường được kỳ vọng ổn định.
- **Kết luận**: đúng, mức **Thấp**.

### 26. Sao chép liên kết có thể báo thành công giả
**✅ Xác nhận đúng**

- `OrganizerRegistrationQRPage.tsx:44-47`:
  ```js
  const copyLink = async () => {
    await navigator.clipboard?.writeText(registrationLink);
    showToast("Đã sao chép liên kết đăng ký sự kiện.");
  };
  ```
- Nếu `navigator.clipboard` không tồn tại (trình duyệt cũ, context không secure — HTTP thay vì HTTPS): optional chaining `?.` khiến biểu thức trả về `undefined` mà không throw, code chạy tiếp và **luôn hiển thị toast thành công** dù không có gì được sao chép.
- Nếu `clipboard` tồn tại nhưng `writeText()` bị từ chối (người dùng chưa cấp quyền clipboard): promise reject, không có `try/catch` nào bắt, toast thành công **không** hiển thị nhưng cũng không có toast lỗi nào thay thế — người dùng chỉ thấy nút không phản hồi gì, lỗi chỉ trồi lên console dưới dạng unhandled rejection.
- **Kết luận**: đúng, mức **Thấp**.

### 27. Nút "In vé" trong drawer Ví vé không hoạt động
**✅ Xác nhận đúng**

- `QRDisplayCard.tsx:14`: `onPrint?: () => void` — prop optional; dòng 71: `<button onClick={onPrint} ...>In vé</button>` — nút luôn được render bất kể `onPrint` có được truyền hay không.
- `MyTicketsPage.tsx:93`: `<QRDisplayCard ticket={activeTicket} event={activeEvent} onDownload={() => showToast(...)} />` — chỉ truyền `onDownload`, **không truyền `onPrint`** → `onClick={undefined}`, bấm nút "In vé" không có phản ứng nào.
- **Kết luận**: đúng, mức **Thấp**.

---

## THẤP (đã xác nhận ở các lần kiểm tra trước)

### 15. Nút "Xem chi tiết" đăng ký không hoạt động
**✅ Xác nhận đúng** — `OrganizerReservationsPage.tsx:80-82` không có `onClick`.

### 16. TypeScript chưa bật strict
**✅ Xác nhận đúng** — `tsconfig.app.json` không có `"strict": true`.

### 17. CSP production chặn Google Fonts
**✅ Xác nhận đúng** — `index.html` gọi `fonts.googleapis.com`/`fonts.gstatic.com`; `Caddyfile` production CSP: `style-src 'self' 'unsafe-inline'` và `font-src 'self' data:` không whitelist hai domain này.

### 18. DataTable không điều chỉnh currentPage khi dữ liệu giảm
**✅ Xác nhận đúng — phát hiện mới hợp lệ**

- `DataTable.tsx:66`: `totalPages = Math.ceil(filteredData.length / pageSize) || 1`.
- `DataTable.tsx:72-74`: `useEffect(() => setCurrentPage(1), [searchTerm, filterValue])` — **chỉ reset `currentPage` khi đổi từ khóa tìm kiếm hoặc bộ lọc**, không có effect nào theo dõi thay đổi của prop `data` (ví dụ khi một hàng bị xóa/duyệt xong khiến danh sách ngắn lại từ nơi gọi, như `OrganizerReservationsPage` sau khi duyệt/từ chối đăng ký).
- Nếu người dùng đang ở trang 2 và dữ liệu co lại khiến `totalPages` giảm còn 1, `currentPage` vẫn giữ giá trị 2 → hiển thị "Trang 2 / 1" và bảng trống (`paginatedData` rỗng do `slice` vượt phạm vi) dù còn dữ liệu ở trang 1.
- **Kết luận**: đúng, mức **Thấp**.

---

## Tổng kết

| # | Mức độ báo cáo | Kết quả xác minh |
|---|---|---|
| Critical | — | ✅ Đồng ý: không có Critical |
| 1 | Cao | ✅ đúng, giữ nguyên mức Cao |
| 2 | Cao | ✅ đúng hoàn toàn |
| 3 | Cao | ✅ đúng hoàn toàn |
| 4 | Cao | ✅ đúng hoàn toàn |
| 5 | Cao (mới) | ✅ đúng — xác nhận là phát hiện hợp lệ |
| 6 | TB | ✅ đúng đầy đủ (nay có bằng chứng rõ "15 phút" trong comment code) |
| 7 | TB | ✅ đúng |
| 8 | TB | ✅ đúng |
| 9 | TB | ✅ đúng |
| 10 | TB | ✅ đúng |
| 11 | TB | ✅ đúng (đối chiếu backend) |
| 12 | TB | ✅ đúng |
| 13 | TB (mới) | ✅ đúng — phát hiện hợp lệ |
| 14 | TB (mới) | ✅ đúng — phát hiện hợp lệ |
| 15 | Thấp | ✅ đúng |
| 16 | Thấp | ✅ đúng |
| 17 | Thấp | ✅ đúng |
| 18 | Thấp (mới) | ✅ đúng — phát hiện hợp lệ |
| 19 | TB (mới) | ✅ đúng — đối chiếu cả `EventService.java` + `TicketReservationService.java` |
| 20 | TB (mới) | ✅ đúng |
| 21 | TB (mới) | ✅ đúng (3/3 dẫn chứng) |
| 22 | TB (mới) | ✅ đúng — mâu thuẫn nội dung rõ ràng |
| 23 | TB (mới) | ✅ đúng — đối chiếu `EventService.java` |
| 24 | TB (mới) | ✅ đúng (3/3 dẫn chứng), là lỗi riêng biệt với mục 10 |
| 25 | Thấp (mới) | ✅ đúng |
| 26 | Thấp (mới) | ✅ đúng |
| 27 | Thấp (mới) | ✅ đúng |

**Toàn bộ 27 mục (bao gồm 9 phát hiện mới ở lần này) đều được xác nhận đúng với mã nguồn thực tế**, kể cả khi đối chiếu chéo với backend (`EventService.java`, `TicketReservationService.java`). Không có mục nào bị bác bỏ hoặc sai lệch so với báo cáo gốc qua 3 lần kiểm tra liên tiếp.
