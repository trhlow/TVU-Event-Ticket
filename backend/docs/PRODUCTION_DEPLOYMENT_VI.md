# Hướng dẫn build và deploy production từ đầu đến cuối

Tài liệu này dùng cho một máy chủ Ubuntu 24.04, một domain thật và kiến trúc
production hiện tại của dự án. Cách triển khai được khuyến nghị là:

```text
Internet
   |
   v
Caddy :80/:443  -- tự cấp và gia hạn TLS
   |--------------------|
   v                    v
Frontend Nginx       Spring Boot monolith
                          |
                -----------------------
                |          |          |
             PostgreSQL  Redis    RabbitMQ ---> SMTP
```

Chỉ Caddy có cổng public. Database, Redis, RabbitMQ và cổng 8080 của backend
không được mở ra Internet.

## 1. Bạn cần chuẩn bị gì?

- Một VPS Ubuntu 24.04, tối thiểu 2 vCPU, 4 GB RAM và 60 GB SSD.
- Một domain, ví dụ `events.example.com`.
- Microsoft Entra App Registration dạng single-tenant:
  - Application (client) ID;
  - Directory (tenant) ID;
  - redirect URI dạng SPA: `https://events.example.com`.
- Một nhà cung cấp SMTP giao dịch và domain gửi mail đã cấu hình SPF, DKIM,
  DMARC.
- Quyền quản trị DNS.
- Repository đã có commit cần deploy và CI của commit đó đã xanh.

## 2. Chuẩn bị DNS và firewall

Tạo bản ghi `A` trỏ domain đến IPv4 của VPS. Chỉ tạo `AAAA` khi VPS thật sự có
IPv6 hoạt động. DNS phải phân giải đúng trước khi Caddy xin chứng chỉ.

Firewall chỉ mở:

- TCP 22 từ IP quản trị tin cậy;
- TCP 80 từ mọi nơi;
- TCP 443 từ mọi nơi.

Không mở 5432, 5672, 6379, 8080 hoặc RabbitMQ Management.

Ví dụ với UFW:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from YOUR_ADMIN_IP to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 3. Cài Docker và tạo deploy user

Cài Docker Engine và Compose plugin từ repository chính thức của Docker. Sau
khi cài, kiểm tra:

```bash
docker version
docker compose version
```

Tạo một user không phải `root`, cho user đó quyền chạy Docker, rồi đăng nhập lại
để group mới có hiệu lực:

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /srv/tvu-event-ticket
```

Docker group có quyền gần tương đương root. Chỉ cấp cho tài khoản deploy riêng,
không dùng chung tài khoản cá nhân.

## 4. Clone đúng release

Đăng nhập bằng user `deploy`:

```bash
git clone https://github.com/trhlow/TVU-Event-Ticket.git /srv/tvu-event-ticket
cd /srv/tvu-event-ticket
git fetch --all --prune
git checkout --detach COMMIT_SHA_DA_QUA_CI
```

Production nên deploy commit SHA bất biến, không nên dựa vào tên branch có thể
di chuyển.

## 5. Tạo secrets production

Script sau sinh độc lập password cho PostgreSQL, Redis, RabbitMQ, CSRF và QR;
đồng thời tạo cặp RSA ổn định cho JWT:

```bash
cd /srv/tvu-event-ticket/backend/infra/production
bash scripts/generate-env.sh \
  events.example.com \
  admin@example.com \
  MICROSOFT_APPLICATION_CLIENT_ID \
  MICROSOFT_DIRECTORY_TENANT_ID
```

Script không ghi đè `.env` có sẵn. Mở `.env` và thay cấu hình SMTP:

```dotenv
SPRING_MAIL_HOST=smtp.example.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=...
SPRING_MAIL_PASSWORD=...
MAIL_FROM_ADDRESS=no-reply@events.example.com
```

Giữ quyền file ở `600`:

```bash
chmod 600 .env
```

Không commit, gửi qua chat hoặc lưu `.env` trong CI log. Cặp RSA phải được sao
lưu an toàn; đổi cặp này sẽ làm mọi phiên đăng nhập hiện tại mất hiệu lực.

## 6. Preflight trước lần deploy đầu

```bash
bash scripts/preflight.sh
```

Preflight chặn deploy khi:

- thiếu Docker, Compose, Git, curl hoặc OpenSSL;
- Docker daemon không dùng được;
- `.env` còn placeholder hay thiếu biến bắt buộc;
- secret quá ngắn;
- issuer JWT không khớp domain;
- cặp private/public RSA không hợp lệ hoặc không cùng một cặp;
- Compose không render được.

Nó cũng cảnh báo khi RAM trống dưới 1,5 GiB hoặc ổ đĩa trống dưới 10 GiB.

## 7. Deploy lần đầu

```bash
bash scripts/deploy.sh
```

Một lệnh này thực hiện theo thứ tự:

1. chạy preflight;
2. build lại image frontend và backend, đồng thời cập nhật base image;
3. nếu database đang chạy, tạo và kiểm tra backup trước deploy;
4. khởi động toàn bộ Compose stack và chờ healthcheck;
5. kiểm tra frontend, health, OIDC discovery và JWKS từ public HTTPS;
6. ghi nhận commit hiện tại để có thể rollback code.

Kiểm tra trạng thái và log:

```bash
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail 200 monolith
docker compose --env-file .env -f compose.yaml logs --tail 200 caddy
```

Các URL bắt buộc phải hoạt động:

- `https://DOMAIN/`;
- `https://DOMAIN/actuator/health`;
- `https://DOMAIN/.well-known/openid-configuration`;
- `https://DOMAIN/.well-known/jwks.json`.

## 8. Checklist nghiệm thu chức năng

Smoke test hạ tầng chưa thay cho kiểm thử nghiệp vụ. Trước khi mở hệ thống:

1. đăng nhập Microsoft bằng đúng tenant TVU;
2. xác nhận token tenant khác bị từ chối;
3. tạo một sự kiện thử;
4. sinh viên đăng ký, ban tổ chức duyệt;
5. xác nhận email và QR đến đúng người;
6. quét QR một lần thành công và lần hai bị từ chối;
7. kiểm tra RabbitMQ không có DLQ bất thường;
8. chạy một backup và restore thử trên máy tách biệt.

## 9. Deploy bản cập nhật bằng GitHub Actions

Tạo GitHub Environment tên `production`, bật required reviewer và khai báo:

- `DEPLOY_HOST`;
- `DEPLOY_USER`;
- `DEPLOY_SSH_PRIVATE_KEY`;
- `DEPLOY_PATH`, ví dụ `/srv/tvu-event-ticket`;
- `DEPLOY_KNOWN_HOSTS`.

Lấy host key trên một kênh tin cậy và đối chiếu fingerprint trước khi lưu:

```bash
ssh-keyscan -H events.example.com
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Sau khi CI xanh, vào workflow **Deploy production**, chọn **Run workflow** và
nhập commit SHA. Workflow SSH vào VPS, checkout đúng commit rồi gọi cùng
`scripts/deploy.sh`; do đó deploy tay và deploy CI không có hai quy trình khác
nhau.

## 10. Backup hằng ngày

Chạy thử:

```bash
bash scripts/backup-postgres.sh
```

Script tạo PostgreSQL custom-format dump, dùng `pg_restore --list` để xác minh,
giữ mặc định 14 ngày trong thư mục backup và có thể copy ra ngoài VPS bằng
`BACKUP_REMOTE` của rclone.

Cron mẫu:

```cron
0 2 * * * cd /srv/tvu-event-ticket/backend/infra/production && BACKUP_REMOTE=remote:tvu-prod bash scripts/backup-postgres.sh >> /var/log/tvu-backup.log 2>&1
```

Backup cùng ổ đĩa với VPS không phải disaster recovery. Luôn có bản off-site và
test restore ít nhất mỗi quý.

## 11. Rollback đúng cách

Rollback code về release được ghi nhận trước đó:

```bash
bash scripts/rollback.sh --confirm
```

Hoặc chỉ định rõ commit:

```bash
bash scripts/rollback.sh --confirm OLD_COMMIT_SHA
```

Script backup database trước, checkout code cũ, build lại, chờ healthcheck và
smoke-test. Nó cố ý không đảo Flyway migration và không tự restore database.
Nếu release mới đã thay schema không tương thích ngược, rollback code có thể
không chạy; khi đó phải dùng kế hoạch migration tiến hoặc restore một backup đã
kiểm chứng:

```bash
bash scripts/restore-postgres.sh --confirm /absolute/path/to/backup.dump
```

Restore thay dữ liệu thật, flush Redis, purge queue và requeue một cửa sổ outbox
để đồng bộ trạng thái. Chỉ chạy sau khi đã diễn tập trên máy tách biệt.

## 12. Vận hành thường ngày

```bash
# Kiểm tra public endpoints và toàn bộ service đang chạy
bash scripts/smoke-test.sh

# Theo dõi tài nguyên
docker stats
df -h

# Xem lỗi gần nhất
docker compose --env-file .env -f compose.yaml logs --since 30m monolith

# Kiểm tra queue
docker compose --env-file .env -f compose.yaml exec rabbitmq \
  rabbitmqctl list_queues name messages consumers
```

Theo dõi tối thiểu: uptime/readiness, HTTP 5xx, dung lượng đĩa, PostgreSQL,
Redis, RabbitMQ consumer và DLQ, lỗi SMTP, thời điểm backup cuối cùng.

## 13. Lỗi thường gặp

**Caddy không cấp được TLS**

- DNS chưa trỏ đúng, cổng 80/443 bị chặn hoặc có bản ghi AAAA sai.
- Xem `docker compose ... logs caddy`.

**Monolith unhealthy**

- Chạy `docker compose ... logs monolith`.
- Thường do `.env` sai, database/Redis/RabbitMQ chưa healthy, RSA sai hoặc
  tenant Microsoft trống.

**Flyway dừng ở V7**

- Database cũ có orphan row vi phạm foreign key. Không sửa migration V7 đã
  phát hành; tạo migration mới để làm sạch/kiểm chứng dữ liệu.

**Frontend mở được nhưng API lỗi**

- Xác nhận `/actuator/health` và `/api/...` đi qua Caddy.
- Không mở trực tiếp cổng 8080 để “chữa tạm”, vì sẽ bỏ qua TLS và ranh giới
  reverse proxy.

**Deploy workflow SSH thất bại**

- Đối chiếu `DEPLOY_KNOWN_HOSTS`, quyền private key, owner của `DEPLOY_PATH` và
  quyền Docker của `DEPLOY_USER`.

## 14. Khi nào có thể gọi là production-ready?

Chỉ coi một release đã bàn giao khi đồng thời có:

- commit SHA cố định và CI xanh;
- preflight xanh;
- deploy + smoke test xanh trên server thật;
- checklist nghiệp vụ đã qua;
- backup off-site đã chạy;
- restore đã diễn tập;
- monitoring/cảnh báo và người chịu trách nhiệm xử lý sự cố.
