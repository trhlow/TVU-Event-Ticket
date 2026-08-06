# Runbook: lượt deploy đầu tiên lên evts.id.vn

Viết theo **hành vi thật của script**, không theo mô tả trong tài liệu khác. Mỗi bước có: lệnh,
dấu hiệu "đã chạy đúng", và phải làm gì khi không.

Chỉ dùng cho lần deploy đầu tiên trên một máy trắng. Các lần sau chỉ cần bước 8.

> Chưa deploy lần nào thì chưa có gì để rollback. Đọc hết bước 9 và 10 **trước** khi chạy bước 8,
> vì đó là hai bước quyết định bạn có đường lùi hay không.

---

## 0-bis. Nếu VPS ĐÃ có một lượt deploy thử trước đó

Bỏ qua mục này nếu máy còn trắng.

Một lượt deploy thử để lại ba thứ mà lượt deploy thật phải xử lý, không phải một:

1. **Volume database** với schema và dữ liệu cũ — Flyway sẽ đối chiếu lịch sử migration với nó.
2. **Tài khoản SUPER_ADMIN "ma"**: mỗi địa chỉ từng nằm trong `BOOTSTRAP_ADMIN_EMAIL` đã thành một
   tài khoản admin **thật** và vẫn đăng nhập được. Nếu khi ấy điền địa chỉ ví dụ, đó là cửa mở.
3. **`.env` sinh bằng bản script cũ**, có thể mang khoá JWT hỏng (xem lỗi PEM ở mục 5).

### Kiểm trước, chỉ đọc

```bash
cd /srv/tvu-event-ticket/backend/infra/production
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml exec -T postgres \
  psql -U tvu_owner -d tvu_app -qtAX -c "select email, role from users where role like '%ADMIN%';"
awk '/^JWT_PRIVATE_KEY_PEM=/{n++} END{print "PEM lines (phải là 1):", n+0}' .env
```

Có dữ liệu thật cần giữ thì **dừng ở đây** — đường nâng cấp tại chỗ khác hẳn, cần backup và đối
chiếu Flyway trước. Phần dưới là đường **xoá sạch làm lại**.

### GIỮ LẠI CHỨNG CHỈ — đừng dùng `down -v`

`caddy_data` chứa chứng chỉ Let's Encrypt và khoá tài khoản ACME. `docker compose down -v` xoá
**mọi** volume, kể cả nó, nên Caddy sẽ phải xin chứng chỉ mới. Let's Encrypt giới hạn **5 chứng chỉ
trùng nhau mỗi 7 ngày** cho một tên miền: chạm giới hạn là **không có HTTPS tới một tuần**, và
không có cách nào rút ngắn.

Đếm số lần đã cấp trong 7 ngày qua tại `https://crt.sh/?q=evts.id.vn` trước khi làm gì.

```bash
cd /srv/tvu-event-ticket/backend/infra/production

# Dừng stack nhưng KHÔNG xoá volume
docker compose --env-file .env -f compose.yaml down

# Xoá đúng ba volume dữ liệu. caddy_data và caddy_config ở lại.
docker volume rm tvu-event-ticket_postgres_data \
                 tvu-event-ticket_redis_data \
                 tvu-event-ticket_rabbitmq_data

# Xác nhận: hai volume caddy còn, ba volume kia mất
docker volume ls | grep tvu-event-ticket
```

### Lấy code mới rồi sinh lại `.env`

```bash
cd /srv/tvu-event-ticket
git fetch origin && git checkout --detach <SHA-tip-của-main>

cd backend/infra/production
rm .env                      # generate-env.sh từ chối ghi đè, nên phải xoá
bash scripts/generate-env.sh evts.id.vn <mail-thật-1>,<mail-thật-2>
```

`.env` mới mang **khoá JWT mới** và **mật khẩu database mới** — đúng như mong muốn, vì volume cũ đã
xoá nên không có gì để không khớp. Điền lại ba dòng SMTP bằng khoá Brevo mới (mục 6).

Sau đó đi tiếp từ **mục 2** (swap) — Docker và user deploy đã có sẵn từ lượt trước.

---

## 0. Trước khi chạm vào VPS

| việc | kiểm tra xong |
|---|---|
| DNS: A record `evts.id.vn` → IP VPS | `dig +short evts.id.vn` từ máy **khác** trả về đúng IP |
| Đăng ký ứng dụng Entra, redirect SPA `https://evts.id.vn` | ghi lại Application (client) ID và Directory (tenant) ID |
| Khoá SMTP Brevo còn hiệu lực | gửi thử một mail từ dashboard Brevo |
| `frontend/.env.production` trong Git khớp hai ID trên | `git show HEAD:frontend/.env.production` |

DNS phải phân giải được **trước** bước 8: Caddy xin chứng chỉ Let's Encrypt bằng cách trả lời
thử thách trên cổng 80, và nó chỉ làm được khi tên miền đã trỏ về đúng máy.

Nếu hai ID trong `.env.production` sai, sửa bằng **một PR**, không sửa tay trên VPS. `preflight.sh`
so hai bên với nhau; sửa một bên là làm chúng lệch nhau theo cách preflight sẽ chặn.

---

## 1. Tường lửa

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```
**Đúng:** `sudo ufw status` liệt kê đúng ba cổng.

## 2. Swap — bắt buộc, không phải khuyến nghị

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
```
**Đúng:** `free -h` hiện 2.0Gi swap.

**Vì sao là bắt buộc:** máy 4 GB phải build đồng thời image Maven và image Vite trong khi Postgres,
Redis, RabbitMQ đang chạy. Không có swap thì kernel giết tiến trình lớn nhất — thường là Postgres.
`preflight.sh` sẽ **dừng** nếu thiếu swap, không chỉ cảnh báo.

## 3. Docker và user deploy

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git curl openssl python3
sudo usermod -aG docker "$USER"
```
**Đúng:** **đăng xuất rồi đăng nhập lại**, sau đó `docker version` và `docker compose version` chạy
được mà không cần `sudo`.

## 4. Lấy đúng commit đã xanh CI

```bash
sudo mkdir -p /srv/tvu-event-ticket && sudo chown "$USER" /srv/tvu-event-ticket
git clone https://github.com/trhlow/TVU-Event-Ticket.git /srv/tvu-event-ticket
cd /srv/tvu-event-ticket && git checkout --detach <SHA-40-ký-tự>
```
**Đúng:** `git rev-parse HEAD` in ra đúng SHA đó.

Detached HEAD là cố ý — `rollback.sh` dựa vào đó.

## 5. Sinh `.env`

```bash
cd /srv/tvu-event-ticket/backend/infra/production
bash scripts/generate-env.sh evts.id.vn <mail-thật-1>,<mail-thật-2>
```

**Đúng:** in `Created .../.env with mode 600.`

**Kiểm ngay, đừng đợi bước sau:**
```bash
awk '/^JWT_PRIVATE_KEY_PEM=/{n++} END{print "phải bằng 1:", n+0}' .env
grep -vE '^\s*#|^\s*$|^[A-Z_]+=' .env    # không được in ra dòng nào
```

Hai địa chỉ mail phải là hộp thư **bạn mở được**. Mỗi địa chỉ ở đây thành một tài khoản
SUPER_ADMIN thật, và đăng nhập admin **chỉ có** đường mã OTP qua mail — một địa chỉ gõ sai là
khoá cửa vĩnh viễn.

## 6. Điền SMTP

Mở `.env`, thay ba dòng còn `REPLACE_WITH_`:

```
SPRING_MAIL_HOST=smtp-relay.brevo.com
SPRING_MAIL_USERNAME=<login Brevo>
SPRING_MAIL_PASSWORD=<SMTP key Brevo>
```

**Đúng:** `grep -c REPLACE_WITH .env` trả về `0`.

## 7. Preflight

```bash
bash scripts/preflight.sh
```
**Đúng:** `Preflight passed for https://evts.id.vn`

Lỗi hay gặp và nghĩa thật của nó:

| thông báo | nghĩa |
|---|---|
| `... swap ... at least 1 GiB is required` | quay lại bước 2 |
| `MICROSOFT_CLIENT_ID ... does not match VITE_...` | `.env` và bundle frontend nói về hai app registration khác nhau — sửa `frontend/.env.production` bằng PR |
| `APP_DOMAIN is ..., but the frontend bundle was built for ...` | bundle build cho tên miền khác; Entra so redirect từng byte |
| `... still contains a REPLACE_WITH placeholder` | còn dòng chưa điền ở bước 6 |

## 8. Deploy

```bash
bash scripts/deploy.sh
```
Lần đầu mất **15–30 phút** trên 2 vCPU.

Script chạy theo thứ tự: preflight → build → khởi động datastore → backup (bỏ qua nếu chưa có
schema) → migration → dựng cả stack → smoke test → ghi `.state/current-ref`.

**Đúng:** `Production deployment completed for <sha>`

| hỏng ở đâu | dấu hiệu | làm gì |
|---|---|---|
| build bị giết | `dmesg \| grep -i oom` có dòng mới | bước 2 chưa làm, hoặc làm chưa xong. Làm rồi chạy lại |
| smoke test | `Deployment started but the public smoke test failed.` | gần như luôn là ACME. `docker compose --env-file .env -f compose.yaml logs caddy \| tail -50`. Chờ cấp chứng chỉ rồi **chạy lại `deploy.sh`** — an toàn, vì `.state/current-ref` chưa được ghi |
| migration | Flyway báo lỗi | database đang ở trạng thái nửa chừng. Xem §"V7" trong `PRODUCTION_DEPLOYMENT_VI.md`. Lần đầu thì chưa có backup nào để restore — vì chưa có gì để mất |

## 9. Backup đầu tiên, và mang nó ra khỏi VPS

```bash
bash scripts/backup-postgres.sh
```
**Đúng:** in `Restore check: N tables came back` rồi `Verified PostgreSQL backup: ...`

Dòng `Restore check` là dòng đáng tin: nó restore thật vào một container tạm rồi đếm bảng.
`pg_restore --list` một mình **không** phát hiện được file bị cắt cụt.

Backup nằm cùng đĩa với `postgres_data`. Nó cứu bạn khỏi một migration hỏng, **không** cứu bạn khỏi
mất máy. Đặt `BACKUP_REMOTE` để có bản off-site — script sẽ đối chiếu kích thước bản từ xa với bản
local và **không xoá gì** nếu không khớp.

## 10. Diễn tập rollback — làm khi chưa có người dùng thật

Đây là bước đóng H10, và nó **không** đóng được bằng cách đọc tài liệu.

```bash
bash scripts/rollback.sh --confirm <SHA-cũ>
```

`rollback.sh` chạy preflight **trước** khi đụng vào cây làm việc, và từ chối nếu database có nhiều
migration hơn số migration mà commit đích mang theo — vì Flyway sẽ không khởi động nổi trên một
lịch sử nó không giải được. Rollback code **không** hoàn tác migration; đó là lý do bước 9 tồn tại.

**Đúng:** `Rolled back application code from ... to ...`, site vẫn phục vụ, rồi deploy lại SHA mới.

## 11. Nghiệm thu

Theo checklist trong `PRODUCTION_DEPLOYMENT_VI.md`. Mục số 1 là mục thật sự chặn:
**mỗi hộp thư trong `BOOTSTRAP_ADMIN_EMAIL` phải nhận được mã OTP.**

---

## Hai script không chạy ở đường này

- `restore-postgres-into-new-stack.sh` — chạy vào stack sống sẽ `dropdb`. Muốn dựng stack song song
  phải đặt `COMPOSE_PROJECT_NAME=tvu-event-ticket-v2`, script không nhận `-p`.
- `clean-slate-inventory.sh` — chỉ dùng cho quy trình cutover, xem `CLEAN_SLATE_CUTOVER_VI.md`.
