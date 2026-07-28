# Hướng dẫn setup VPS từ máy mới tinh

Tài liệu này chỉ lo phần **hạ tầng máy chủ** — từ lúc thuê xong VPS đến lúc máy
sẵn sàng chạy Docker. Phần cấu hình ứng dụng (secrets, deploy, backup, rollback)
đã có đầy đủ ở [PRODUCTION_DEPLOYMENT_VI.md](PRODUCTION_DEPLOYMENT_VI.md) mục
4 trở đi — làm tiếp theo đó sau khi xong tài liệu này. Thông số đã chốt xem ở
[DEPLOY_LOW_COST_VI.md](DEPLOY_LOW_COST_VI.md).

## 0. Thông số máy đã thuê

| Hạng mục | Giá trị |
|---|---|
| Nhà cung cấp | VPS Việt Nam (Cloud Server Linux) |
| CPU / RAM / Disk | 2 vCPU / 4 GB RAM / 60 GB |
| OS | `Ubuntu-24.04.lts` (bản trơn — **không** chọn bản kèm n8nPanel/OpenClaw) |
| Domain trỏ về | `evts.id.vn` |

## 1. Đăng nhập lần đầu

Nhà cung cấp thường gửi IP + mật khẩu root qua email/SMS. Đăng nhập:

```bash
ssh root@<IP_PUBLIC>
```

Đổi mật khẩu root ngay (dù sau này sẽ tắt login bằng mật khẩu):

```bash
passwd
```

## 2. Cập nhật hệ thống

```bash
apt update && apt full-upgrade -y
apt install -y curl git ufw fail2ban
reboot
```

Đợi ~1 phút rồi SSH lại.

## 3. Tạo user triển khai (không dùng root cho việc hàng ngày)

```bash
adduser deploy
usermod -aG sudo deploy
```

Copy SSH public key của máy cá nhân sang user `deploy` (thay
`~/.ssh/id_ed25519.pub` bằng key thật của bạn nếu khác):

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Nếu không thao tác từ máy đã có key trong `authorized_keys` của root, tạo thủ
công:

```bash
mkdir -p /home/deploy/.ssh
echo "<NỘI DUNG PUBLIC KEY CỦA BẠN>" >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Mở terminal **mới** (giữ session root đang mở phòng khi lỗi), thử đăng nhập
bằng `deploy` trước khi tắt password login ở bước sau:

```bash
ssh deploy@<IP_PUBLIC>
```

## 4. Khoá SSH lại

Chỉ làm bước này **sau khi** đã xác nhận đăng nhập bằng key với user `deploy`
thành công — nếu tắt password login trước khi test xong, có thể bị khoá khỏi
máy.

Sửa `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
```

Áp dụng:

```bash
systemctl restart ssh
```

## 5. Firewall (UFW)

Chỉ mở đúng 3 cổng cần thiết — Postgres/Redis/RabbitMQ/8080 tuyệt đối không mở
ra Internet (đã compose để chỉ Caddy có cổng public):

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

Nếu muốn chặt hơn, giới hạn cổng 22 theo IP quản trị cố định:

```bash
ufw allow from <IP_QUAN_TRI> to any port 22 proto tcp
```

## 6. Cài Docker Engine + Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Đăng xuất rồi đăng nhập lại (hoặc `newgrp docker`) để group có hiệu lực, sau đó
kiểm tra:

```bash
docker version
docker compose version
```

## 7. Tạo thư mục deploy

```bash
install -d -o deploy -g deploy /srv/tvu-event-ticket
```

## 8. Trỏ DNS

Vào trang quản trị domain `evts.id.vn`, sửa bản ghi:

```text
Loại: A    Tên: @    Giá trị: <IP_PUBLIC của VPS>
```

TTL đang đặt 1 phút nên đổi có hiệu lực gần như ngay. Kiểm tra đã trỏ đúng
trước khi qua bước tiếp theo (Caddy cần DNS đúng để xin chứng chỉ TLS):

```bash
dig +short evts.id.vn
```

## 9. Bước tiếp theo

Đăng nhập bằng user `deploy`, sau đó làm theo
[PRODUCTION_DEPLOYMENT_VI.md](PRODUCTION_DEPLOYMENT_VI.md) từ **mục 4 (Clone
đúng release)** trở đi:

```bash
git clone https://github.com/trhlow/TVU-Event-Ticket.git /srv/tvu-event-ticket
cd /srv/tvu-event-ticket
git checkout --detach <COMMIT_SHA_DA_QUA_CI>
```

rồi `generate-env.sh` → `preflight.sh` → `deploy.sh` như tài liệu đó mô tả.

## 10. Checklist nhanh

- [ ] Đăng nhập root, đổi mật khẩu
- [ ] `apt full-upgrade` + reboot
- [ ] Tạo user `deploy`, gắn SSH key, test đăng nhập được
- [ ] Tắt root login + password login qua SSH
- [ ] UFW chỉ mở 22/80/443
- [ ] Docker + Compose plugin cài xong, `deploy` chạy được `docker` không cần
      sudo
- [ ] `/srv/tvu-event-ticket` thuộc về user `deploy`
- [ ] DNS `evts.id.vn` trỏ đúng IP VPS
- [ ] Sẵn sàng qua PRODUCTION_DEPLOYMENT_VI.md mục 4
