# Triển khai production và chi phí

Tài liệu này dành cho nhóm 3 người vận hành TVU Event & Ticket ở giai đoạn
đầu. Nhóm đã sở hữu tên miền, nên không tính phí gia hạn tên miền ở đây.

## Trạng thái triển khai trong repository

Bộ file production đã được chuẩn bị tại
[`backend/infra/production`](backend/infra/production): Docker Compose, Caddy,
mẫu `.env`, backup/restore PostgreSQL và workflow deploy thủ công trên GitHub
Actions. Profile backend production nằm tại
[`backend/monolith/src/main/resources/application-prod.yml`](backend/monolith/src/main/resources/application-prod.yml).

Trước khi public, vẫn phải điền secret thật, tạo Microsoft Entra application,
xác thực domain gửi email, trỏ DNS và cấu hình GitHub environment secrets theo
[`backend/infra/production/README.md`](backend/infra/production/README.md).

## Quyết định đề xuất

Triển khai toàn bộ ứng dụng trên **một máy ảo** bằng Docker Compose:

```text
Internet
  -> DNS (Cloudflare hoặc nhà cung cấp tên miền)
  -> Caddy (HTTPS)
       -> Frontend Vite static files
       -> /api -> Spring Boot modular monolith
                    -> PostgreSQL
                    -> Redis
                    -> RabbitMQ
                    -> Resend SMTP
```

Không public trực tiếp PostgreSQL, Redis, RabbitMQ hoặc Spring Boot. Chỉ mở
cổng 80/443; SSH chỉ cho phép bằng SSH key.

## Chi phí đầy đủ mỗi tháng

| Hạng mục | Gói tiết kiệm nhất | Gói trả phí ổn định |
| --- | ---: | ---: |
| Máy chủ chạy toàn bộ hệ thống | OCI Always Free: 0đ | VPS Linux 4 GB RAM: khoảng 500.000–650.000đ |
| DNS | 0đ | 0đ |
| HTTPS (Caddy + Let's Encrypt) | 0đ | 0đ |
| Frontend hosting | Đã nằm trên máy chủ | Đã nằm trên máy chủ |
| PostgreSQL, Redis, RabbitMQ | Đã nằm trên máy chủ | Đã nằm trên máy chủ |
| Email giao dịch | Resend Free: 0đ | Resend Free: 0đ |
| Sao lưu database ngoài máy | 0–50.000đ | 30.000–100.000đ |
| CI/CD | 0đ ở quy mô nhóm nhỏ | 0đ ở quy mô nhóm nhỏ |
| **Tổng** | **0–50.000đ/tháng** | **550.000–750.000đ/tháng** |

Chi phí VPS là ước lượng tại thời điểm tháng 07/2026 và thay đổi theo nhà
cung cấp, khu vực và tỷ giá. Là mốc tham khảo, AWS Lightsail công bố máy Linux
4 GB ở mức 24 USD/tháng. Ước lượng VND bên trên đã chừa phần chênh lệch tỷ giá
và phí thanh toán quốc tế.

## Phương án ưu tiên: OCI Always Free

Tạo một máy Ubuntu ARM64 trong home region với cấu hình tối đa 2 OCPU và 12 GB
RAM. Hạn mức này đủ cho monolith, PostgreSQL, Redis và RabbitMQ ở quy mô đồ án.

- Compute: 0đ nếu vẫn trong hạn mức Always Free.
- Email: 0đ nếu dưới 3.000 email/tháng và 100 email/ngày.
- Backup: giữ 7–14 bản `pg_dump` đã nén ở một nơi khác máy chủ.
- Tổng: thường là 0đ/tháng; dự trù tối đa 50.000đ/tháng cho backup.

Điều kiện và rủi ro: OCI yêu cầu chọn home region khi tạo tài khoản; máy ARM
Always Free đôi khi báo hết capacity. Nếu không tạo được máy sau khi thử các
availability domain hoặc chờ, dùng phương án VPS trả phí bên dưới.

Nguồn tham khảo:

- [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)

## Phương án dự phòng: VPS 4 GB tại Singapore

Chọn một VPS Linux có tối thiểu 2 vCPU, 4 GB RAM và 60–80 GB SSD. Đặt tại
Singapore để có độ trễ tốt từ Việt Nam. Đây là mức tối thiểu an toàn vì máy
chạy đồng thời Java, PostgreSQL và RabbitMQ.

- Không chọn gói 2 GB RAM cho production hiện tại.
- Không tách PostgreSQL/Redis/RabbitMQ thành dịch vụ managed ở giai đoạn này;
  tổng chi phí sẽ tăng nhanh hơn lợi ích nhận được.
- Nếu chia đều, ngân sách khoảng 550.000–750.000đ/tháng tương đương
  180.000–250.000đ/người/tháng.

Mốc so sánh chính thức: [AWS Lightsail Linux bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html).

## Các dịch vụ miễn phí nên dùng

| Nhu cầu | Lựa chọn | Ghi chú |
| --- | --- | --- |
| DNS | Cloudflare Free hoặc DNS của nhà đăng ký domain | Không cần mua thêm DNS. Cloudflare không tính phí truy vấn DNS ở gói Free. |
| HTTPS | Caddy + Let's Encrypt | Tự cấp và gia hạn chứng chỉ. |
| Email | Resend Free | Xác thực SPF, DKIM và DMARC cho domain trước khi gửi. |
| CI/CD | GitHub Actions | Build/test rồi SSH deploy vào máy chủ. |
| Uptime | Một dịch vụ monitor HTTP miễn phí | Kiểm tra endpoint health định kỳ. |

Resend Free hiện có giới hạn 3.000 email/tháng và 100 email/ngày. Nếu vượt
ngưỡng này, Resend Pro bắt đầu từ 20 USD/tháng; chỉ nâng cấp khi số liệu thực tế
cho thấy cần thiết.

Nguồn tham khảo:

- [Cloudflare DNS FAQ](https://developers.cloudflare.com/dns/faq/)
- [Resend pricing](https://resend.com/pricing?product=transactional)

## Những cấu hình bắt buộc trước khi public

1. Frontend dùng `VITE_API_BASE_URL=/api` để frontend và API ở cùng origin.
2. Caddy nhận HTTPS và reverse proxy `/api` đến container monolith.
3. Bật cookie `Secure`, đặt JWT issuer theo URL HTTPS thật của domain.
4. Đặt toàn bộ secret trong `.env` chỉ có trên máy chủ: mật khẩu database,
   JWT/QR/CSRF signing secrets và SMTP credential. Không commit file này.
5. Chỉ đưa frontend, Caddy và health check ra Internet. Không public cổng
   5432, 6379, 5672 và RabbitMQ Management UI.
6. Thiết lập backup PostgreSQL hằng đêm, giữ 7–14 ngày và thử khôi phục ít nhất
   một lần trước khi chạy sự kiện thật.
7. Giới hạn JVM trong production, ví dụ `-Xms128m -Xmx768m`, thay vì để JVM có
   thể chiếm phần lớn RAM của máy.

## Quy trình deploy

1. Tạo VM Ubuntu 24.04 ARM64 (OCI) hoặc VPS Linux 4 GB.
2. Cài Docker Engine và Docker Compose plugin; cấu hình firewall và SSH key.
3. Trỏ bản ghi DNS của domain về IP máy chủ.
4. Tạo `.env` production và xác thực domain gửi email với Resend.
5. Chạy Docker Compose gồm Caddy, frontend, monolith, PostgreSQL, Redis và
   RabbitMQ.
6. Kiểm tra HTTPS, `/actuator/health`, đăng nhập, gửi email QR và check-in.
7. Tự động hóa từ GitHub Actions: push/merge nhánh phát hành -> test/build ->
   SSH vào máy -> cập nhật Docker Compose.

## Khi nào cần nâng cấp

- RAM thường xuyên trên 80%, RabbitMQ hoặc PostgreSQL bị OOM: nâng VM lên 8 GB.
- Vượt 3.000 email/tháng hoặc 100 email/ngày: cân nhắc gói email trả phí.
- Dữ liệu quan trọng hoặc chạy sự kiện lớn: thêm bản backup object storage và
  diễn tập khôi phục.
- Chỉ tách dịch vụ/database sang máy khác khi có số liệu tải hoặc yêu cầu
  uptime cụ thể, không phải chỉ vì kiến trúc ban đầu phức tạp hơn.
