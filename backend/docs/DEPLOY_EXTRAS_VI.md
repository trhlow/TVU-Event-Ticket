# Ngoài VPS ra còn cần setup gì? (Cloudflare và các thứ khác)

Trả lời ngắn: **Cloudflare KHÔNG bắt buộc** — Caddy trong compose đã tự xin
chứng chỉ Let's Encrypt và lo toàn bộ HTTPS. Nhưng có một số hạng mục **ngoài
phạm vi** của [VPS_SETUP_VI.md](VPS_SETUP_VI.md) và
[DEPLOY_LOW_COST_VI.md](DEPLOY_LOW_COST_VI.md) mà nhóm nên làm. Bảng tổng hợp:

| # | Hạng mục | Bắt buộc? | Thời gian |
|---|---|---|---|
| 1 | Cloudflare | ❌ Không (tuỳ chọn, có caveat) | 30 phút |
| 2 | Secrets GitHub Actions cho auto-deploy | ✅ Nếu muốn deploy qua Actions (mục 9 PRODUCTION_DEPLOYMENT_VI.md) | 15 phút |
| 3 | Brevo domain authentication (DKIM/SPF) | ⚠️ Rất nên — tránh mail vé QR vào spam | 20 phút |
| 4 | Rotate SMTP key Brevo | ✅ Trước ngày demo (key cũ từng lộ qua chat) | 5 phút |
| 5 | Swap file trên VPS 4GB | ✅ Nên — chống OOM khi build/chạy full stack | 5 phút |
| 6 | Uptime monitoring (UptimeRobot) | ⚠️ Nên — biết server chết trước giám khảo | 10 phút |
| 7 | Tự động cập nhật bảo mật (unattended-upgrades) | ⚠️ Nên | 5 phút |
| 8 | Backup offsite (tải dump về máy cá nhân) | ✅ Trước ngày bảo vệ | 5 phút |

---

## 1. Cloudflare — tuỳ chọn, đọc kỹ trước khi bật

### Có cần không?

Với quy mô demo môn học: **không cần**. Những gì Cloudflare cho miễn phí
(CDN, chống DDoS, ẩn IP VPS) không giải quyết vấn đề nào nhóm đang có, còn
HTTPS thì Caddy đã lo xong. Chỉ cân nhắc nếu:

- muốn **ẩn IP thật** của VPS (chống bị quét/tấn công thẳng vào IP);
- muốn quản lý DNS ở một chỗ giao diện tốt hơn nhà đăng ký domain;
- muốn có lớp chống DDoS cơ bản (khả năng bị DDoS trong buổi bảo vệ ≈ 0).

### Caveat quan trọng nếu bật proxy (đám mây cam)

Khi bật proxy, Cloudflare đứng giữa người dùng và Caddy. Hai điểm phải xử lý:

1. **Let's Encrypt HTTP-01 có thể fail**: Caddy xin chứng chỉ qua cổng 80,
   nhưng traffic giờ đi qua Cloudflare. Cách đơn giản nhất: để **DNS only**
   (đám mây xám) cho đến khi Caddy xin được chứng chỉ lần đầu, rồi mới bật
   proxy — các lần gia hạn sau Caddy vẫn tự lo được vì Cloudflare mode
   "Full (strict)" vẫn chuyển tiếp HTTP-01 challenge trong đa số trường hợp,
   nhưng nếu gia hạn fail thì phải tắt proxy tạm.
2. **SSL/TLS mode phải là "Full (strict)"**: vào Cloudflare → SSL/TLS →
   chọn **Full (strict)**. Nếu để "Flexible", Cloudflare gọi về origin bằng
   HTTP cổng 80 → Caddy redirect về HTTPS → vòng lặp redirect vô hạn, site
   chết ngay.

### Các bước nếu vẫn muốn dùng

1. Tạo tài khoản https://dash.cloudflare.com (free plan).
2. **Add site** → nhập `evts.id.vn` → chọn plan Free.
3. Cloudflare quét record DNS hiện có — kiểm tra record A `@ → <IP VPS>`
   được import đúng.
4. Cloudflare cấp 2 nameserver (dạng `xxx.ns.cloudflare.com`). Vào trang quản
   trị của **nhà đăng ký domain** (Tenten/Mắt Bão/iNET...) → đổi nameserver
   của `evts.id.vn` sang 2 NS đó. Chờ 5 phút – vài giờ để có hiệu lực.
5. Trong Cloudflare DNS, để record A ở chế độ **DNS only** (đám mây xám).
6. Deploy bình thường, xác nhận `https://evts.id.vn` chạy (Caddy đã có chứng
   chỉ).
7. (Tuỳ chọn) Bật proxy (đám mây cam) + SSL/TLS → **Full (strict)**.
8. Kiểm tra lại toàn bộ flow: login Microsoft, nhận mail, quét QR.

> Lưu ý: đổi nameserver nghĩa là mọi record DNS (kể cả các record DKIM/SPF
> của Brevo ở mục 3) từ nay phải tạo **trong Cloudflare**, không phải ở nhà
> đăng ký nữa. Nếu đã tạo record Brevo trước đó, kiểm tra chúng được import
> đủ.

**Khuyến nghị của tài liệu này: bỏ qua Cloudflare cho đợt báo cáo.** Thêm một
tầng trung gian = thêm một nguồn lỗi mới (redirect loop, cert renew fail)
ngay trước ngày bảo vệ.

---

## 2. Secrets GitHub Actions cho auto-deploy — bắt buộc nếu dùng mục 9

Workflow `.github/workflows/deploy-production.yml` cần 5 secrets. Vào repo
GitHub → **Settings → Secrets and variables → Actions → New repository
secret**, tạo đủ:

| Secret | Giá trị |
|---|---|
| `DEPLOY_HOST` | IP public của VPS |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/srv/tvu-event-ticket` |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key SSH **riêng cho CI** (xem dưới) |
| `DEPLOY_KNOWN_HOSTS` | Output của `ssh-keyscan` (xem dưới) |

Tạo key riêng cho CI (đừng dùng key cá nhân) — chạy trên máy cá nhân:

```bash
ssh-keygen -t ed25519 -f deploy_ci_key -N "" -C "github-actions-deploy"
```

- Nội dung `deploy_ci_key` (private) → dán vào secret `DEPLOY_SSH_PRIVATE_KEY`.
- Nội dung `deploy_ci_key.pub` → thêm vào VPS:

  ```bash
  ssh deploy@<IP_VPS>
  echo "<NỘI DUNG deploy_ci_key.pub>" >> ~/.ssh/authorized_keys
  ```

Lấy `DEPLOY_KNOWN_HOSTS` (chạy trên máy cá nhân, dán toàn bộ output vào
secret):

```bash
ssh-keyscan -H <IP_VPS>
```

Xoá 2 file `deploy_ci_key*` khỏi máy sau khi dán xong. Không commit chúng.

---

## 3. Brevo domain authentication (DKIM/SPF) — chống mail vào spam

Không authenticate thì mail vẫn gửi được nhưng dễ vào spam — rất tệ nếu giám
khảo không thấy vé QR. Các bước:

1. Đăng nhập Brevo → **Senders, Domains & Dedicated IPs → Domains** →
   **Add a domain** → nhập `evts.id.vn`.
2. Brevo hiện danh sách record DNS cần tạo, thường gồm:
   - 1 record **TXT** xác minh sở hữu (dạng `brevo-code=...`);
   - 2 record **DKIM** (loại TXT hoặc CNAME, tên dạng `mail._domainkey`...);
   - 1 record **TXT SPF**: `v=spf1 include:spf.brevo.com mx ~all` (nếu domain
     đã có record SPF khác thì **gộp** `include:spf.brevo.com` vào record cũ,
     không tạo 2 record SPF song song).
3. Tạo đúng từng record trong trang quản trị DNS của domain (hoặc Cloudflare
   nếu đã chuyển NS theo mục 1 — nhớ để **DNS only** cho các record này).
4. Quay lại Brevo bấm **Verify/Authenticate**. DNS TTL 1 phút nên thường xác
   minh được ngay; nếu chưa, chờ 15–30 phút thử lại.
5. Xong thì gửi thử 1 vé tới Gmail cá nhân, mở **Show original** kiểm tra
   `SPF: PASS`, `DKIM: PASS`.

---

## 4. Rotate SMTP key Brevo — trước ngày demo

Key hiện tại từng được gửi qua chat nên coi như đã lộ:

1. Brevo → **SMTP & API → SMTP** → **Generate a new SMTP key**, đặt tên
   `tvu-event-ticket-prod`.
2. Trên VPS, sửa `.env` trong `/srv/tvu-event-ticket`: cập nhật
   `SPRING_MAIL_PASSWORD=<key mới>`.
3. Restart backend: `docker compose ... up -d monolith` (đúng lệnh trong
   PRODUCTION_DEPLOYMENT_VI.md mục 12).
4. Gửi thử 1 email OK rồi mới **xoá key cũ** trong Brevo.

---

## 5. Swap file — VPS 4GB nên có

Stack (Postgres + Redis + RabbitMQ + Spring Boot 768m + Caddy) chạy vừa trong
4GB nhưng lúc `docker compose build` trên chính VPS có thể spike RAM → OOM
killer giết ngẫu nhiên một container. 2GB swap là bảo hiểm rẻ:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.d/99-swap.conf
```

Kiểm tra: `free -h` phải thấy dòng `Swap: 2.0Gi`.

---

## 6. Uptime monitoring — UptimeRobot free

Để biết site chết **trước khi** giám khảo biết:

1. Đăng ký https://uptimerobot.com (free: 50 monitor, check mỗi 5 phút).
2. **Add New Monitor**:
   - Type: **HTTP(s)**;
   - URL: `https://evts.id.vn/actuator/health`;
   - Friendly name: `TVU Event Ticket`;
   - Alert contact: email của nhóm (thêm được nhiều email).
3. Từ giờ server sập hoặc health trả khác 200 là có mail báo trong ≤5 phút.

---

## 7. Tự động vá bảo mật — unattended-upgrades

VPS chạy cả học kỳ không ai SSH vào hàng ngày, nên để Ubuntu tự vá lỗ hổng:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # chọn Yes
```

Mặc định chỉ cài bản vá security, không tự reboot — an toàn cho demo.

---

## 8. Backup offsite — trước ngày bảo vệ

`scripts/backup-postgres.sh` đã backup **trên VPS**, nhưng VPS chết thì mất
cả backup. Sau khi nhập xong dữ liệu demo:

```bash
# Trên VPS
bash scripts/backup-postgres.sh

# Trên máy cá nhân — tải file dump mới nhất về
scp deploy@<IP_VPS>:/srv/tvu-event-ticket/backups/<file_moi_nhat>.dump ~/Downloads/
```

Kèm theo (đã dặn trong DEPLOY_LOW_COST_VI.md mục 6 nhưng nhắc lại vì quan
trọng): **quay video demo đầy đủ flow** — đây là phao cứu sinh cuối cùng.

---

## Những thứ vẫn KHÔNG cần

- ~~Cloudflare~~ (như phân tích ở mục 1 — tuỳ chọn, khuyến nghị bỏ qua);
- ~~CDN/Load balancer, WAF trả phí, managed DB, SSL trả phí~~ — xem
  DEPLOY_LOW_COST_VI.md mục 7;
- ~~Sentry/log tập trung~~ — `docker compose logs` đủ cho quy mô này;
- ~~Container registry riêng~~ — build từ source ngay trên VPS.

## Checklist tổng

- [ ] (Tuỳ chọn) Quyết định có dùng Cloudflare không — nếu không, bỏ qua
- [ ] 5 secrets GitHub Actions tạo đủ, chạy thử workflow deploy 1 lần
- [ ] Brevo authenticate domain, SPF/DKIM PASS khi gửi thử tới Gmail
- [ ] SMTP key mới, key cũ đã xoá
- [ ] Swap 2GB bật, `free -h` xác nhận
- [ ] UptimeRobot monitor `https://evts.id.vn/actuator/health`
- [ ] unattended-upgrades bật
- [ ] Dump Postgres + video demo nằm trên máy cá nhân
