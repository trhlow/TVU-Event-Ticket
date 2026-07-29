# Phương án deploy kinh phí thấp nhất (báo cáo kết thúc môn)

Mục tiêu: đưa hệ thống lên Internet với domain thật + HTTPS + login Microsoft
hoạt động, chi phí **tiệm cận 0đ**, đủ dùng trong một học kỳ để demo và báo cáo.

Tài liệu này chọn **nhà cung cấp và gói dịch vụ**; còn thao tác kỹ thuật trên
server (firewall, secrets, deploy script, backup, rollback) đã có đầy đủ trong
[PRODUCTION_DEPLOYMENT_VI.md](PRODUCTION_DEPLOYMENT_VI.md) — làm theo đúng thứ
tự đó sau khi chuẩn bị xong các tài khoản ở đây.

## 0. Thông số đã chốt (cập nhật 2026-07-26)

| Hạng mục | Giá trị | Trạng thái |
|---|---|---|
| Domain | `evts.id.vn` | ✅ Đã đăng ký, record A `@` → `202.92.6.37`, TTL 1 phút |
| Entra App | Display name `TVU Event Ticket` | ✅ Đã tạo |
| `MICROSOFT_CLIENT_ID` | `119dfe0f-e3b6-487b-b695-7f0dabe327c2` | ✅ (giá trị công khai, ghi được vào đây) |
| `MICROSOFT_TENANT_ID` | `e76c9cee-253d-47f7-bae3-a36caaa916c1` | ✅ |
| SMTP | Brevo, `smtp-relay.brevo.com:587`, login `b1a2ba001@smtp-brevo.com` | ✅ Đã có SMTP key — **chỉ điền vào `.env` trên server, tuyệt đối không commit** |
| `MAIL_FROM_ADDRESS` | `no-reply@evts.id.vn` | ⚠️ Cần authenticate domain trong Brevo (mục 4) |
| Server | ✅ VPS Việt Nam đã thuê — Cloud Server Linux, 2 vCPU / 4GB RAM / 60GB, OS **Ubuntu-24.04.lts** (bản trơn, không panel) | Còn lại: trỏ DNS + deploy |

Việc cần làm tiếp, theo thứ tự:

1. Lấy IP public của VPS vừa thuê.
2. Sửa record A của `evts.id.vn` trỏ về IP VPS vừa thuê (nếu `202.92.6.37`
   không phải server của nhóm — TTL 1 phút nên đổi là ăn ngay).
3. Vào Entra App `TVU Event Ticket` → Authentication → thêm redirect URI loại
   **SPA**: `https://evts.id.vn` (nếu chưa khai đúng giá trị này).
4. Vào Brevo → Senders & Domains → thêm domain `evts.id.vn`, tạo các bản ghi
   DNS (DKIM/SPF) mà Brevo yêu cầu, để gửi được từ `no-reply@evts.id.vn`.
5. Làm theo PRODUCTION_DEPLOYMENT_VI.md mục 2–8 trên VPS. `generate-env.sh` chỉ
   nhận **hai** tham số — domain `evts.id.vn` và danh sách email admin. Client ID
   và tenant ID được đọc từ `frontend/.env.production` chứ không nhập tay nữa,
   nên bảng trên là nguồn để *điền vào file đó*, không phải để gõ vào CLI. Sau đó
   điền SMTP Brevo vào `.env`.

> **Bảo mật SMTP key**: key Brevo đã từng được gửi qua chat trong lúc trao
> đổi. Trước ngày demo, vào Brevo tạo SMTP key mới, cập nhật `.env` trên
> server rồi xóa key cũ.

## Tổng quan chi phí

| Hạng mục | Phương án khuyến nghị | Chi phí |
|---|---|---|
| Domain | `evts.id.vn` — VNNIC miễn phí năm đầu cho công dân VN 18–23 tuổi | **0đ** năm đầu (~50–100k/năm sau) |
| Domain (nếu bắt buộc `.edu.vn`) | `evt.edu.vn` qua Tenten/Mắt Bão/iNET | ~400–550k/năm + hồ sơ chứng minh hoạt động giáo dục |
| Server (VPS) | VPS Việt Nam 2–4 GB RAM (Azure/Oracle free không khả dụng với nhóm) | ~100–200k/tháng |
| HTTPS/TLS | Caddy tự xin Let's Encrypt (đã có sẵn trong compose) | **0đ** |
| Login Microsoft | Microsoft Entra ID free tier (App Registration) | **0đ** |
| Email gửi vé QR | Brevo free tier (300 mail/ngày) | **0đ** |
| **Tổng** | | **~300–600k cho 3 tháng học kỳ** (chỉ tốn tiền VPS) |

## 1. Domain

### Lưu ý về `evt.edu.vn`

Theo quy định VNNIC, đuôi `.edu.vn` dành cho **tổ chức, cá nhân hoạt động trong
lĩnh vực giáo dục – đào tạo**. Nhóm sinh viên tự đăng ký có thể bị nhà đăng ký
yêu cầu giấy tờ chứng minh; phí đăng ký + duy trì khoảng 400–550k đ/năm. Nếu
đề tài không bắt buộc đúng tên `evt.edu.vn`, không nên chọn đuôi này.

### Khuyến nghị: `evts.id.vn` — 0đ

VNNIC có chương trình **miễn phí năm đầu tên miền `.id.vn` cho công dân Việt
Nam 18–23 tuổi** (đúng đối tượng sinh viên, cần CCCD khi đăng ký).

1. Vào một nhà đăng ký .vn: Tenten, Mắt Bão, iNET, P.A Việt Nam.
2. Tìm mục ưu đãi "id.vn miễn phí" / "Sáng tạo tên miền quốc gia".
3. Đăng ký `evts.id.vn` (hoặc tên khác nếu đã bị lấy), xác thực CCCD.
4. Sau khi domain kích hoạt, vào trang quản trị DNS của nhà đăng ký,
   tạo bản ghi:

   ```text
   Loại: A    Tên: @ (hoặc evt tùy cách nhập)    Giá trị: <IP public của VPS>
   ```

   Chỉ tạo bản ghi AAAA nếu VPS thật sự có IPv6. Bản ghi phải phân giải đúng
   **trước khi** chạy deploy, vì Caddy cần nó để xin chứng chỉ TLS.

## 2. Server

Yêu cầu tối thiểu để chạy stack production (Caddy + frontend + Spring Boot
monolith `-Xmx768m` + PostgreSQL + Redis + RabbitMQ): **2 vCPU, 4 GB RAM,
Ubuntu 24.04**. 2 GB RAM chạy được nhưng rất khít; 4 GB an toàn cho demo.

### Phương án A — Azure for Students (❌ đã thử, không dùng được — Azure không duyệt student TVU)

- **$100 credit miễn phí, không cần thẻ tín dụng**, chỉ cần xác minh email
  sinh viên (`@st.tvu.edu.vn` hoặc tương tự).
- Đăng ký tại: https://azure.microsoft.com/free/students
- Tạo VM: **Ubuntu Server 24.04 LTS, size B2s (2 vCPU / 4 GB RAM)** ≈
  $30–35/tháng → credit đủ chạy ~3 tháng, trọn học kỳ.
- Chọn region **Southeast Asia (Singapore)** cho latency tốt từ Việt Nam.
- Khi tạo VM, mở sẵn port 22 (chỉ từ IP của bạn nếu được), 80, 443 trong
  Network Security Group.
- Điểm cộng lớn: cùng tài khoản này dùng luôn cho **Microsoft Entra App
  Registration** ở bước 3 — một tài khoản giải quyết hai việc.

Lưu ý: credit hết hoặc hết hạn (12 tháng) thì VM dừng — với mục tiêu báo cáo
kết thúc môn thì không thành vấn đề, nhưng nhớ **backup dữ liệu và quay video
demo trước ngày bảo vệ** để không phụ thuộc server sống.

### Phương án B — Oracle Cloud Always Free (❌ không dùng được — cần thẻ quốc tế, nhóm không có)

- VM ARM Ampere A1: tối đa 4 OCPU / 24 GB RAM, **miễn phí không thời hạn**.
- Đăng ký tại: https://www.oracle.com/cloud/free/ — **cần thẻ tín dụng/ghi nợ
  quốc tế để xác minh** (không trừ tiền).
- Nhược điểm:
  - Region hay hết slot ARM free (thử Singapore, Osaka, Seoul; có thể phải
    thử lại nhiều ngày).
  - Máy ARM64: phải build Docker image **trên chính VM** (Dockerfile của dự án
    build từ source nên hoạt động bình thường trên arm64, chỉ là không dùng
    được image build sẵn từ máy x86).
  - Tài khoản free đôi khi bị Oracle thu hồi nếu idle lâu.

### Phương án C — VPS Việt Nam trả phí ⬅ **đã thuê**

Azure for Students không duyệt được email sinh viên TVU và nhóm không có thẻ
quốc tế cho Oracle, nên đây là phương án thực tế của nhóm — **đã chốt**:

- Gói: Cloud Server Linux, **2 vCPU / 4GB RAM / 60GB**, OS **Ubuntu-24.04.lts**
  (bản trơn — nhà cung cấp cũng có bản kèm sẵn n8nPanel/OpenClaw nhưng
  **không chọn** vì các panel đó dễ chiếm port 80/443 mà Caddy cần để xin
  chứng chỉ Let's Encrypt, và tốn thêm RAM trên máy chỉ 4GB).
- Latency tốt nhất từ Việt Nam, không cần xác minh gì thêm.
- Thuê xong lấy IP public → cập nhật record A của `evts.id.vn` (mục 0).

## 3. Microsoft Entra App Registration (login Microsoft) — 0đ

Frontend production build với `VITE_AUTH_PROVIDER=microsoft` và backend profile
`prod` xác thực ID token thật, nên bắt buộc phải có App Registration:

1. Đăng nhập https://entra.microsoft.com bằng tài khoản Microsoft của trường
   (lý tưởng: tenant TVU; nếu không có quyền, dùng tenant của tài khoản Azure
   for Students và ghi rõ giới hạn này trong báo cáo).
2. **App registrations → New registration**:
   - Supported account types: **single tenant**;
   - Redirect URI: chọn loại **Single-page application (SPA)**, giá trị
     `https://evts.id.vn` (đúng domain đã mua, có `https://`, không dấu `/`
     cuối).
3. Ghi lại 2 giá trị ở trang Overview:
   - **Application (client) ID** → biến `MICROSOFT_CLIENT_ID`;
   - **Directory (tenant) ID** → biến `MICROSOFT_TENANT_ID`.
4. Không cần client secret — flow SPA dùng PKCE, frontend là public client.

Sinh viên đăng nhập phải có tài khoản trong đúng tenant đã chọn (token tenant
khác sẽ bị backend từ chối — đây là hành vi đúng, xem checklist nghiệm thu
trong PRODUCTION_DEPLOYMENT_VI.md mục 8).

## 4. SMTP gửi email vé QR — 0đ

Mailpit chỉ dành cho dev. Production cần SMTP thật; free tier đủ dùng cho demo:

### Khuyến nghị: Brevo (https://www.brevo.com)

- Free: **300 email/ngày**, không cần thẻ.
- Đăng ký → **SMTP & API → SMTP** → lấy host, port, login, SMTP key.
- Điền vào `.env` production (bước 5 của PRODUCTION_DEPLOYMENT_VI.md):

  ```dotenv
  SPRING_MAIL_HOST=smtp-relay.brevo.com
  SPRING_MAIL_PORT=587
  SPRING_MAIL_USERNAME=<login Brevo>
  SPRING_MAIL_PASSWORD=<SMTP key>
  MAIL_FROM_ADDRESS=no-reply@evts.id.vn
  ```

- Nên vào phần **Senders & Domains** của Brevo thêm domain `evts.id.vn` và tạo
  các bản ghi DNS (SPF/DKIM) họ yêu cầu — không bắt buộc để gửi được, nhưng
  giảm mạnh khả năng mail vào spam khi demo.

### Dự phòng: Gmail + App Password

Chỉ nên dùng khi Brevo trục trặc: bật 2FA cho một Gmail, tạo App Password,
dùng `smtp.gmail.com:587`. Giới hạn ~500 mail/ngày, header From sẽ là Gmail
nên kém chuyên nghiệp hơn.

## 5. Trình tự thực hiện

Chuẩn bị tài khoản (làm song song được, tổng ~1–2 buổi):

1. Đăng ký domain (mục 1) — chờ kích hoạt.
2. Đăng ký Azure for Students / Oracle Free, tạo VM Ubuntu 24.04 (mục 2),
   lấy IP public.
3. Trỏ bản ghi A của domain về IP đó.
4. Tạo Entra App Registration với redirect URI đúng domain (mục 3).
5. Đăng ký Brevo, lấy thông số SMTP (mục 4).

Sau đó làm theo **PRODUCTION_DEPLOYMENT_VI.md từ mục 2 đến mục 8** trên VPS:
firewall → cài Docker → clone repo đúng commit SHA đã qua CI → chạy
`scripts/generate-env.sh <domain> <emails>` (client/tenant ID đọc từ
`frontend/.env.production`) → điền SMTP
Brevo vào `.env` → `scripts/preflight.sh` → `scripts/deploy.sh` → chạy
checklist nghiệm thu chức năng.

Khi các URL sau hoạt động là deploy xong:

- `https://evts.id.vn/` — trang chủ, có nút "Đăng nhập bằng tài khoản Microsoft";
- `https://evts.id.vn/actuator/health` — trả `UP`;
- đăng ký sự kiện → duyệt → nhận email vé QR → quét check-in thành công.

## 6. Riêng cho buổi báo cáo

- **Quay video demo đầy đủ flow trước ngày bảo vệ.** Server free tier có thể
  chết đúng lúc quan trọng; video là phao cứu sinh.
- Chạy `bash scripts/backup-postgres.sh` và tải file dump về máy cá nhân sau
  khi đã nhập dữ liệu demo (sự kiện, tài khoản, vé mẫu).
- Chuẩn bị sẵn 2–3 tài khoản Microsoft trong tenant để demo các vai trò
  (sinh viên / BTC / admin) không phải tạo tại chỗ.
- Sáng ngày bảo vệ: mở `https://<domain>/actuator/health`, gửi thử 1 email,
  đăng nhập thử 1 vòng — phát hiện sự cố sớm còn kịp xử lý.
- Sau môn học: nếu dùng Azure credit thì tắt VM để khỏi cháy credit vô ích;
  domain `.id.vn` năm sau muốn giữ thì đóng phí gia hạn, không thì để hết hạn.

## 7. Những thứ KHÔNG cần chi tiền

- ~~Load balancer / CDN~~ — Caddy trên 1 VPS là đủ cho quy mô demo.
- ~~Managed database (RDS, Cloud SQL)~~ — Postgres trong compose + backup
  script có sẵn là đủ.
- ~~Chứng chỉ SSL trả phí~~ — Let's Encrypt qua Caddy tự động và miễn phí.
- ~~Email server riêng / gói SMTP trả phí~~ — 300 mail/ngày của Brevo thừa cho
  demo.
- ~~Nhiều môi trường (staging)~~ — với mục tiêu báo cáo môn, một môi trường
  production là đủ; test trước bằng docker compose local.
