# Runbook — clean slate + cutover blue-green

> Nguồn quyết định: `AUTH_OTP_FIX_CHECKLIST_VI.md` mục **C3.0** (chốt Phương án 1 —
> clean slate, 2026-07-28) và **C3.-1** (sơ đồ migration). Tài liệu này là **cách
> thi hành**, không phải chỗ chốt lại quyết định. Nếu hai bên mâu thuẫn, checklist
> đúng và tài liệu này sai.

**Tài liệu này chưa được thực thi lần nào.** Nó là thiết kế đã chốt, viết trước để
người làm không phải tự suy đoán giữa lúc cutover.

## 0. Điều kiện tiên quyết

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| C3.0 đã chốt bằng văn bản | ✅ | Clean slate, `trhlow`, 2026-07-28 |
| H13.1 đã chốt | ✅ | Phương án (B) → **có V15** |
| Bản kiểm kê bằng chứng | ⬜ **còn nợ** | Mục 1 dưới đây |
| H13/H14 (restore + break-glass) | ⬜ | **Bắt buộc xong trước cutover** |
| H8 đã deploy | ⬜ | H8 làm mọi JWT cũ mất hiệu lực → cần H14 trước |

⛔ Không bắt đầu mục 2 khi mục 1 chưa có file kết quả.

## 1. Kiểm kê trước khi xoá — bắt buộc, không bỏ qua

Clean slate là thao tác **không hoàn tác được**. Nó chỉ chính đáng khi đã chứng minh
không còn dữ liệu thật cần giữ, và "chứng minh" nghĩa là một bản đếm có ngày giờ, chứ
không phải trí nhớ.

```bash
bash backend/infra/production/scripts/clean-slate-inventory.sh
```

Script đếm **cả 9 bảng** (`users`, `clubs`, `events`, `reservations`, `tickets`,
`ticket_inventories`, `audit_log`, `outbox_messages`, `trusted_devices`),
`outbox_messages` theo status, **mọi** queue RabbitMQ kể cả retry và DLQ, và các
prefix key Redis.

Ba điều dễ làm sai, đã tính trước trong script:

- **Chỉ đếm `users`/`reservations`/`tickets` là chưa đủ.** Một CLB hoặc một sự kiện
  nhập tay vẫn là dữ liệu thật.
- **Message trong DLQ vẫn gửi email thật sau cutover.** Vì vậy liệt kê mọi queue bằng
  `rabbitmqctl list_queues`, không hardcode tên queue (tên đến từ cấu hình).
- **Prefix Redis sai sẽ đếm ra 0 và trông y hệt "không có dữ liệu".** Các prefix lấy
  thẳng từ source Java: `otp:`, `otp:cooldown:`, `otp:daily:`, `notification:done:`,
  `notification:lock:`, `ticket:remaining:`, `auth:revoked:`.

Ghi cạnh file kết quả: **ai** xác nhận số nào là dữ liệu thử bỏ được, và **ngày nào**.

## 2. Dựng stack v2 song song (blue-green)

Stack cũ **vẫn chạy** suốt mục 2 và 3. Đây là điểm khác biệt với "drop rồi restore":
luôn có một hệ thống đang phục vụ.

- Project name riêng: `docker compose -p tvu-event-ticket-v2 ...` (stack hiện tại là
  `name: tvu-event-ticket`, `compose.yaml:1`). Volume của v2 tách hẳn, **không** dùng
  lại volume cũ.
- ⛔ **Xử lý xung đột cổng trước tiên.** `compose.yaml:10-11` bind thẳng `80:80` và
  `443:443`; dựng v2 y nguyên sẽ **fail khi bind**, hoặc tệ hơn là cướp cổng của stack
  đang phục vụ. Cách làm: v2 **không** publish 80/443 — chỉ cần trong mạng nội bộ, vì
  Caddy sẽ trỏ sang nó ở mục 4.
- RabbitMQ v2: volume mới **hoặc** vhost mới, kèm cấp quyền cho user.
- Redis v2: instance riêng, rỗng.
- Chạy **Flyway migrate tới latest**. ⛔ Không hardcode số phiên bản vào runbook —
  chuỗi hiện tại là V1→V14, hoặc V1→V15 vì H13.1 đã chốt (B). Kiểm bằng
  `flyway_schema_history`.
- Bootstrap **đúng danh sách email quản trị thật đã duyệt** (xem H6). Không dùng
  giá trị mặc định.

## 3. Giai đoạn A — nghiệm thu khi chưa mở ghi

Đây là giai đoạn duy nhất còn rollback an toàn.

**"No-write" nghĩa là gì** — phải định nghĩa chính xác, nếu không sẽ tự mâu thuẫn, vì
chính các test dưới đây đều ghi DB (verify OTP ghi trusted device, Microsoft login
`save(user)`, bootstrap, outbox):

- Chặn **ghi nghiệp vụ từ người dùng công cộng**: đăng ký sự kiện, cấp vé, check-in.
- Cho operator/tài khoản test đi qua bằng **IP allowlist / VPN / mTLS**.
- ⛔ **"Header tạm thời" là bypass giả.** Header đến từ client; ai đoán được tên +
  giá trị là vượt được, tức mở ghi cho toàn Internet đúng lúc định đóng. Nếu buộc
  dùng header thì Caddy phải `header_up -X-Maintenance-Bypass` (xoá header client
  gửi) rồi mới tự chèn lại **sau** một lớp xác thực riêng ở edge.
- Test bắt buộc: gửi request kèm header bypass từ IP **ngoài** allowlist → phải bị chặn.

Smoke test đầy đủ trên v2 **trước khi** đụng Caddy/DNS: đăng nhập OTP thật tới hòm thư
bootstrap, đăng nhập Microsoft, tạo sự kiện, đăng ký, duyệt, nhận email vé, check-in QR.

## 4. Cutover

- Đổi upstream trong `Caddyfile` sang service của v2 rồi `reload` cấu hình — **không**
  restart Caddy (restart làm rơi kết nối đang phục vụ). Hiện upstream là
  `monolith:8080` (`Caddyfile:20,28,34`) và `frontend:80` (`:38`).
  ⚠️ H12 sẽ đổi frontend sang cổng **8080**; làm H12 trước thì sửa luôn ở đây, tránh 502.
- Đặt site vào maintenance **ở edge (Caddy)**, không phải bằng cách dừng container app.
  Dừng container thì người dùng thấy 502, không phải trang bảo trì.

## 5. Commit point — ranh giới không quay lại

**Commit point = lúc mở ghi cho người dùng công cộng (bắt đầu giai đoạn B).**

- Trước commit point: rollback an toàn, và phải khôi phục **đồng bộ cả bốn** — code cũ
  + PostgreSQL + Redis + RabbitMQ cũ.
- ⛔ Sau commit point: **rollback về DB cũ không còn an toàn** — dữ liệu người dùng
  thật đã ghi vào v2 sẽ mất. Chỉ còn roll-forward (sửa tiến), hoặc một quy trình đồng
  bộ dữ liệu với RPO đã chấp nhận và ghi rõ **trước**.
- ⛔ Tuyệt đối không chạy code cũ trên DB đã migrate tới bất kỳ schema nào từ V12 trở
  lên: code cũ không biết `auth_version`, không biết lineage trusted-device, và vi phạm
  CHECK constraint mới.

## 6. Sau cutover

- **Giữ nguyên volume của stack cũ** tới hết thời gian lưu giữ rollback. ⛔ Không
  "xoá toàn bộ volume cũ" — làm vậy là phá chính đường rollback mà mục 5 dựa vào.
  Xoá là bước **cuối cùng**, sau khi hết retention.
- **Không purge RabbitMQ cũ** trong lúc còn giữ đường lùi.
- Dọn state phía client: bundle mới đã có `src/lib/legacyStorageCleanup.ts`, chạy lúc
  khởi động và xoá 3 key `tvu_event_ticket_{events,reservations,tickets}_v1`.
  - Cookie `TVU_AUTH` và `TVU_DEVICE` là **HttpOnly** → JavaScript **không** xoá được.
    Chỉ backend trả `Set-Cookie` với `Max-Age=0` (đã có `AuthCookieService.logoutCookies()`),
    hoặc FE gọi endpoint logout. Viết code FE xoá hai cookie đó sẽ im lặng không làm gì.
  - Khi hết thời gian giữ tương thích: xoá `legacyStorageCleanup.ts` **và** nhánh miễn
    trừ tương ứng trong `frontend/scripts/verify-bundle.mjs` — hai thứ này đi cùng nhau
    (giai đoạn 2 của gate).
