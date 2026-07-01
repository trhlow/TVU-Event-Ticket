**TRƯỜNG ĐẠI HỌC TRÀ VINH**

**KHOA KỸ THUẬT VÀ CÔNG NGHỆ**

BỘ MÔN CÔNG NGHỆ THÔNG TIN

**ĐỀ CƯƠNG CHI TIẾT**

**ĐỒ ÁN CÔNG NGHỆ PHẦN MỀM**

**TÊN ĐỀ TÀI**

**XÂY DỰNG HỆ THỐNG PHÂN TÁN QUẢN LÝ SỰ KIỆN VÀ VÉ ĐIỆN TỬ CHO CÂU LẠC BỘ ĐẠI HỌC TRÀ VINH (TVU) ỨNG DỤNG KIẾN TRÚC MICROSERVICES**

**Giảng viên hướng dẫn:** ............................................................

**Nhóm sinh viên thực hiện:**

1. .................................................................. – MSSV: ......................

2. .................................................................. – MSSV: ......................

3. .................................................................. – MSSV: ......................

Lớp: ...................................... Khóa: ......................................

*Trà Vinh, tháng 7 năm 2026*

# MỤC LỤC

[MỤC LỤC 1](#_Toc233824206)

[1. TỔNG QUAN VÀ TÍNH CẤP THIẾT CỦA ĐỀ TÀI 3](#_Toc233824207)

[1.1 Hiện trạng 3](#_Toc233824208)

[1.2 Tính cấp thiết và lý do chọn đề tài 3](#_Toc233824209)

[2. MỤC TIÊU ĐỀ TÀI 4](#_Toc233824210)

[2.1 Mục tiêu tổng quát 4](#_Toc233824211)

[2.2 Mục tiêu cụ thể 4](#_Toc233824212)

[Đối với sinh viên TVU: 4](#_Toc233824213)

[Đối với Ban tổ chức (CLB): 4](#_Toc233824214)

[Đối với mục tiêu Công nghệ phần mềm: 4](#_Toc233824215)

[3. ĐỐI TƯỢNG VÀ PHẠM VI THỰC HIỆN 4](#_Toc233824216)

[3.1 Đối tượng nghiên cứu và sử dụng 4](#_Toc233824217)

[3.2 Phạm vi chức năng 5](#_Toc233824218)

[3.3 Phạm vi công nghệ và giới hạn nguồn lực 5](#_Toc233824219)

[4. PHƯƠNG PHÁP THỰC HIỆN 5](#_Toc233824220)

[4.1 Phương pháp nghiên cứu 5](#_Toc233824221)

[4.2 Quy trình phát triển 5](#_Toc233824222)

[4.3 Công nghệ sử dụng 5](#_Toc233824223)

[5. THIẾT KẾ KIẾN TRÚC HỆ THỐNG 7](#_Toc233824224)

[5.1 Sơ đồ kiến trúc tổng thể 7](#_Toc233824225)

[5.2 Mô tả các tầng kiến trúc 7](#_Toc233824226)

[6. GIẢI PHÁP KỸ THUẬT CHUYÊN SÂU 9](#_Toc233824227)

[6.1 Quản lý mã nguồn theo mô hình Monorepo 9](#_Toc233824228)

[6.2 Bảo mật và CORS tập trung tại API Gateway 9](#_Toc233824229)

[6.3 Chống vượt số lượng vé (overbooking) và chống đăng ký ảo 9](#_Toc233824230)

[Lớp 1 — Giữ chỗ nguyên tử ngay khi nhận request: 9](#_Toc233824231)

[Lớp 2 — Chống đăng ký ảo: 10](#_Toc233824232)

[6.4 Cơ chế hướng sự kiện (Event-Driven) với RabbitMQ và Dead Letter Queue 10](#_Toc233824233)

[6.5 Tinh chỉnh bộ nhớ JVM (Performance Tuning) 10](#_Toc233824234)

[6.6 An toàn mã QR điểm danh 11](#_Toc233824235)

[6.7 Đồng bộ kiểu dữ liệu Frontend–Backend qua OpenAPI 11](#_Toc233824236)

[6.8 Chiến lược xác thực (Authentication) 11](#_Toc233824237)

[6.9 Kiểm thử tải (Load Testing) 11](#_Toc233824238)

[6.10 Giám sát hệ thống (Monitoring) 12](#_Toc233824239)

[7. CHIẾN LƯỢC TRIỂN KHAI HẠ TẦNG ĐÁM MÂY 0 ĐỒNG 13](#_Toc233824240)

[7.1 Bảng lựa chọn hạ tầng 13](#_Toc233824241)

[7.2 Rủi ro hạ tầng và phương án dự phòng 13](#_Toc233824242)

[8. KẾ HOẠCH THỰC HIỆN (SPRINT BACKLOG) 15](#_Toc233824243)

[8.1 Thành viên 1 — Frontend (React + TypeScript) & Analytics 15](#_Toc233824244)

[8.2 Thành viên 2 — Backend Core & RabbitMQ 15](#_Toc233824245)

[8.3 Thành viên 3 — Cloud Architecture, API Gateway & Security 16](#_Toc233824246)

[9. RỦI RO DỰ ÁN VÀ PHƯƠNG ÁN MVP 18](#_Toc233824247)

[10. DỰ KIẾN KẾT QUẢ ĐẠT ĐƯỢC 18](#_Toc233824248)

[11. TÀI LIỆU THAM KHẢO 19](#_Toc233824249)

# 1. TỔNG QUAN VÀ TÍNH CẤP THIẾT CỦA ĐỀ TÀI

## 1.1 Hiện trạng

Hiện nay, việc tổ chức sự kiện tại Đại học Trà Vinh (TVU) — hội thảo chuyên đề, ngày hội hướng nghiệp, giao lưu văn hóa của các câu lạc bộ (CLB) — chủ yếu được quản lý thông qua các biểu mẫu Google Forms. Cách làm này đơn giản, triển khai nhanh, nhưng không được thiết kế cho các bài toán có ràng buộc số lượng và cao điểm truy cập, dẫn đến ba vấn đề lặp lại ở hầu hết các sự kiện lớn của trường.

* Đăng ký ảo (fake registration): một sinh viên có thể gửi nhiều lượt đăng ký, hoặc dùng script tự động để giữ chỗ hàng loạt, khiến vé không đến được tay người có nhu cầu thực.
* Vượt số lượng vé (overbooking): khi hàng trăm sinh viên truy cập cùng lúc lúc mở đăng ký, Google Forms không có cơ chế khóa/đếm nguyên tử nên số lượt đăng ký được ghi nhận dễ vượt số ghế thực tế.
* Thiếu điểm danh tự động: Ban tổ chức phải đối chiếu danh sách bằng tay tại cửa vào, tốn nhân lực và dễ sai sót, đặc biệt với sự kiện có quy mô trên vài trăm người.

## 1.2 Tính cấp thiết và lý do chọn đề tài

Ba vấn đề trên đều là các bài toán kinh điển của lĩnh vực hệ thống phân tán và chịu tải cao (high-concurrency systems): kiểm soát truy cập, đảm bảo tính nhất quán dữ liệu khi có tranh chấp tài nguyên (race condition), và xử lý bất đồng bộ khi lưu lượng tăng đột biến. Đây đồng thời là những chủ đề trọng tâm của môn học Công nghệ phần mềm và phù hợp để triển khai bằng kiến trúc Microservices — kiến trúc phổ biến trong công nghiệp hiện nay khi cần chia nhỏ hệ thống thành các dịch vụ độc lập, dễ mở rộng và bảo trì.

Việc lựa chọn đề tài này giúp nhóm thực hiện vừa giải quyết một nhu cầu thực tế của các CLB tại TVU, vừa có cơ hội thực hành đầy đủ vòng đời phát triển phần mềm: từ thiết kế kiến trúc, lập trình, kiểm thử, đến triển khai (DevOps) trên hạ tầng đám mây thực tế với chi phí tối ưu.

# 2. MỤC TIÊU ĐỀ TÀI

## 2.1 Mục tiêu tổng quát

Xây dựng một hệ thống quản lý sự kiện và phát hành vé điện tử dạng phân tán (microservices), có khả năng chịu tải cao, đảm bảo không vượt số lượng vé phát hành, chống được các hình thức đăng ký ảo phổ biến, và được triển khai hoàn toàn trên hạ tầng đám mây miễn phí.

## 2.2 Mục tiêu cụ thể

### Đối với sinh viên TVU:

* Bắt buộc đăng nhập bằng tài khoản email sinh viên @tvu.edu.vn (Microsoft Entra ID / Microsoft 365) trước khi thực hiện bất kỳ thao tác đăng ký nào — hệ thống không cho phép đăng ký nặc danh hay tự nhập tay thông tin, nhằm loại bỏ tận gốc nguy cơ đăng ký ảo.
* Xem thông tin sự kiện, số vé còn lại theo thời gian thực.
* Đăng ký giữ chỗ (ở trạng thái chờ Ban tổ chức duyệt); sau khi được duyệt sẽ nhận vé kèm mã QR qua email. Tối đa 1 vé/sự kiện/tài khoản.

### Đối với Ban tổ chức (CLB):

Tài khoản Ban tổ chức do Quản trị viên nhà trường cấp và gắn với một CLB cụ thể (club\_id); mỗi thành viên Ban tổ chức dùng một tài khoản cá nhân riêng nhưng cùng thuộc một CLB, đảm bảo truy vết được ai đã thao tác (audit log).

* Tạo và cấu hình sự kiện của CLB mình: số lượng vé, thời gian mở/đóng đăng ký.

Duyệt hoặc từ chối từng đăng ký của sinh viên; chỉ khi duyệt, hệ thống mới giữ chỗ nguyên tử và phát vé (xem Mục 6.3 và 6.11).

* Quét mã QR điểm danh trực tiếp tại sự kiện, chống vé giả và vé bị dùng trùng.
* Theo dõi dashboard riêng của CLB (lọc theo club\_id): số lượng đăng ký theo thời gian, tỷ lệ điểm danh — mỗi CLB chỉ thấy dữ liệu sự kiện của mình.

### Đối với Quản trị viên hệ thống (nhà trường):

Tạo, khóa, xóa tài khoản Ban tổ chức của các CLB và đặt lại mật khẩu.

Quản lý danh mục CLB và phân bổ quyền theo vai trò (RBAC).

Xem thống kê toàn trường trên tất cả các CLB và sự kiện.

### Đối với mục tiêu Công nghệ phần mềm:

* Xây dựng hệ thống chịu tải cao, có số liệu kiểm thử tải minh chứng cụ thể.
* Thiết kế API an toàn, xử lý hàng đợi bất đồng bộ đúng cách (không chỉ giảm tải mà còn đảm bảo tính đúng đắn dữ liệu).
* Triển khai hoàn toàn trên hạ tầng đám mây với chi phí 0 đồng, có phương án dự phòng rủi ro hạ tầng.

# 3. ĐỐI TƯỢNG VÀ PHẠM VI THỰC HIỆN

## 3.1 Đối tượng nghiên cứu và sử dụng

* Sinh viên đang theo học tại Đại học Trà Vinh, có tài khoản email theo domain @tvu.edu.vn.
* Ban chủ nhiệm/Ban tổ chức các câu lạc bộ (CLB) trực thuộc TVU.

## 3.2 Phạm vi chức năng

Đồ án tập trung vào luồng nghiệp vụ cốt lõi: tạo sự kiện → mở đăng ký → giữ chỗ/phát vé → gửi vé điện tử → quét QR điểm danh → thống kê. Các chức năng mở rộng (thanh toán vé có phí, tích hợp mạng xã hội, ứng dụng di động native) nằm ngoài phạm vi của đồ án này và được đề xuất là hướng phát triển trong tương lai.

## 3.3 Phạm vi công nghệ và giới hạn nguồn lực

Hệ thống được xây dựng và triển khai hoàn toàn trên các dịch vụ có gói miễn phí (free tier) của các nhà cung cấp cloud, phù hợp với ngân sách 0 đồng của một đồ án học thuật. Nhóm thực hiện gồm 3 thành viên, triển khai trong 4 sprint. Do giới hạn về thời gian và nhân lực, đồ án ưu tiên tính đúng đắn của luồng nghiệp vụ cốt lõi hơn là số lượng tính năng; phần Rủi ro & phương án MVP (Mục 9) quy định rõ những gì có thể cắt giảm nếu tiến độ không cho phép.

# 4. PHƯƠNG PHÁP THỰC HIỆN

## 4.1 Phương pháp nghiên cứu

* Nghiên cứu tài liệu: tra cứu tài liệu chính thức của Spring Cloud Gateway, RabbitMQ, và các nhà cung cấp hạ tầng (Oracle Cloud, Neon, CloudAMQP, Cloudflare) để đảm bảo các quyết định kỹ thuật dựa trên thông tin cập nhật tại thời điểm thực hiện, không dựa trên giả định cũ.
* Thực nghiệm: xây dựng bản mẫu (prototype) cho từng thành phần, kiểm thử tải bằng công cụ mã nguồn mở trước khi hoàn thiện.

## 4.2 Quy trình phát triển

Nhóm áp dụng quy trình Scrum rút gọn với 4 Sprint, mỗi Sprint có mục tiêu rõ ràng (Sprint Goal) và được tổng kết bằng một bản demo chạy được (working increment). Backlog chi tiết theo từng thành viên được trình bày tại Mục 8.

## 4.3 Công nghệ sử dụng

|  |  |
| --- | --- |
| **Thành phần** | **Công nghệ** |
| Frontend | React, TypeScript, Recharts (biểu đồ thống kê) |
| API Gateway | Spring Cloud Gateway (JWT, CORS tập trung, Rate Limiter) |
| Microservices | Java Spring Boot: Event-Service, Ticket-Service, Notification-Service |
| Bộ đếm/Khóa nguyên tử | Redis (giữ chỗ vé, rate-limit counter) |
| Hàng đợi bất đồng bộ | RabbitMQ (CloudAMQP) — Topic Exchange, Dead Letter Queue |
| CSDL giao dịch | PostgreSQL (Neon) |
| Kho dữ liệu phân tích | Oracle Autonomous Data Warehouse (ADW) |
| Xác thực | Microsoft Identity Platform / Entra ID (OAuth2/OIDC qua MSAL, giới hạn tenant @tvu.edu.vn) + JWT nội bộ |
| Đóng gói & triển khai | Docker, Docker Compose, GitHub Actions (CI/CD) |
| Kiểm thử tải | k6 / JMeter |

# 5. THIẾT KẾ KIẾN TRÚC HỆ THỐNG

## 5.1 Sơ đồ kiến trúc tổng thể

![](data:image/png;base64...)

*Hình 1. Kiến trúc tổng thể hệ thống TVU Event & Ticketing Platform*

## 5.2 Mô tả các tầng kiến trúc

* Tầng Frontend: React + TypeScript, đồng bộ kiểu dữ liệu (DTO) với Backend qua OpenAPI spec sinh tự động — không định nghĩa tay để tránh lệch cấu trúc khi API thay đổi.
* Tầng API Gateway: là chốt chặn duy nhất xử lý CORS, xác thực JWT, kiểm tra vai trò (RBAC) và giới hạn tần suất request (rate limiting) — lớp phòng vệ đầu tiên chống spam/bot và làm ngập request.
* Tầng Microservices: ba dịch vụ độc lập theo nghiệp vụ (Event, Ticket, Notification), giao tiếp gián tiếp qua message broker để giảm phụ thuộc trực tiếp (loose coupling).
* Tầng giữ chỗ nguyên tử (Redis): đứng giữa Ticket-Service và RabbitMQ, đảm bảo số vé được trừ đúng và nguyên tử tại thời điểm Ban tổ chức duyệt đăng ký, trước khi đưa vào xử lý bất đồng bộ.
* Tầng giao tiếp bất đồng bộ (RabbitMQ): xử lý các tác vụ không cần phản hồi ngay (tạo QR, gửi email), có Dead Letter Queue cho các tác vụ thất bại.
* Tầng dữ liệu: PostgreSQL cho dữ liệu giao dịch, Oracle ADW cho phân tích/báo cáo của Ban tổ chức.

# 6. GIẢI PHÁP KỸ THUẬT CHUYÊN SÂU

Đây là phần thể hiện chiều sâu kỹ thuật của đồ án: mỗi tiểu mục giải quyết một vấn đề cụ thể phát sinh khi hệ thống vận hành trong điều kiện tài nguyên hạn chế và lưu lượng truy cập không ổn định.

## 6.1 Quản lý mã nguồn theo mô hình Monorepo

Toàn bộ mã nguồn Frontend, Backend và cấu hình Docker được lưu trong một kho duy nhất, cho phép thực hiện các bản cập nhật mang tính nguyên tử (atomic commit): khi API ở Backend thay đổi, Frontend được cập nhật và kiểm thử trong cùng một Pull Request. Nhóm sử dụng cấu trúc thư mục rõ ràng (frontend/, services/event-service/, services/ticket-service/, services/notification-service/, infra/) kết hợp GitHub Actions với path filter để chỉ build/test phần bị ảnh hưởng, đạt hiệu quả tương tự công cụ Nx nhưng giảm thời gian học công cụ mới cho nhóm 3 người.

## 6.2 Bảo mật và CORS tập trung tại API Gateway

Trình duyệt sẽ chặn các request từ React gọi sang Spring Boot nếu khác domain (lỗi CORS). Thay vì cấu hình phân tán tại từng controller, hệ thống cấu hình tập trung tại application.yml của API Gateway:

* Kích hoạt spring.cloud.gateway.globalcors.add-to-simple-url-handler-mapping: true để Gateway tự xử lý các request Preflight OPTIONS mà không cần chuyển tiếp xuống microservices.
* Cấu hình allowCredentials: true để truyền JWT qua cookie HTTP-only, chỉ định đích danh allowedOrigins (không dùng ký tự \*).

## 6.3 Chống vượt số lượng vé (overbooking) và chống đăng ký ảo

Đây là phần giải quyết trực tiếp hai vấn đề đã nêu ở Mục 1. Vì mỗi đăng ký của sinh viên phải được Ban tổ chức duyệt (xem Mục 6.11), điểm giữ chỗ nguyên tử được đặt tại thời điểm duyệt chứ không phải lúc sinh viên bấm đăng ký: thao tác bấm đăng ký chỉ tạo bản ghi ở trạng thái chờ duyệt (PENDING) và chưa trừ vé. Nếu chỉ dùng RabbitMQ để giảm tải, hệ thống vẫn có thể phát vé vượt số lượng khi nhiều lượt duyệt diễn ra gần như đồng thời; do đó việc kiểm tra và trừ vé tại thời điểm duyệt vẫn phải là thao tác nguyên tử. Giải pháp gồm hai lớp:

### Lớp 1 — Giữ chỗ nguyên tử tại thời điểm Ban tổ chức duyệt:

* Khi Ban tổ chức bấm duyệt một đăng ký, hệ thống dùng Redis DECR (hoặc Lua script) trên biến đếm "số vé còn lại" của sự kiện; nếu kết quả âm, trả lỗi "Hết vé" ngay lập tức và giữ nguyên đăng ký ở trạng thái chờ (không trừ vé, không phát vé).
* Chỉ khi giữ chỗ thành công, đăng ký mới chuyển sang trạng thái ĐÃ DUYỆT và hệ thống publish message vào RabbitMQ để Notification-Service tạo QR và gửi email — phần xử lý bất đồng bộ này không ảnh hưởng đến tính đúng đắn của số lượng vé.
* Khóa lạc quan (@Version trong JPA) tại PostgreSQL làm lớp bảo vệ thứ hai khi Ticket-Service ghi nhận bản ghi vé, phòng trường hợp Redis gặp sự cố.

### Lớp 2 — Chống đăng ký ảo:

* Bắt buộc đăng nhập bằng tài khoản @tvu.edu.vn (Mục 6.8): mọi đăng ký đều gắn với một danh tính sinh viên đã xác thực, không có đăng ký nặc danh.
* Ràng buộc UNIQUE(event\_id, student\_id) ở CSDL, đảm bảo tối đa 1 vé/sự kiện/tài khoản.
* Idempotency key cho mỗi request đăng ký để tránh double-click/double-submit bị tính thành nhiều lượt.

Rate limiting theo IP tại API Gateway chỉ dùng để chống spam/bot (làm ngập request), không dùng để định danh hay chặn đăng ký lại: nhiều sinh viên dùng chung Wi-Fi/NAT của trường sẽ bị chặn oan, còn người cố tình gian lận chỉ cần đổi mạng là vượt qua — việc định danh dựa hoàn toàn vào tài khoản đăng nhập và ràng buộc UNIQUE(event\_id, student\_id).

## 6.4 Cơ chế hướng sự kiện (Event-Driven) với RabbitMQ và Dead Letter Queue

Sau khi đăng ký được duyệt và giữ chỗ thành công (Mục 6.3), Ticket-Service publish message chứa reservation\_id vào RabbitMQ. Notification-Service tiêu thụ message này để tạo vé/QR và gửi email — đây là các tác vụ không cần phản hồi ngay lập tức nên phù hợp xử lý bất đồng bộ, giúp API trả kết quả nhanh dù backend đang bận. Dead Letter Queue được thiết lập để tự động bắt các giao dịch thất bại (ví dụ gửi email lỗi), giúp kỹ sư kiểm tra lại mà không gây nghẽn vòng lặp thông điệp và không ảnh hưởng đến việc vé đã được giữ chỗ hợp lệ.

## 6.5 Tinh chỉnh bộ nhớ JVM (Performance Tuning)

Ứng dụng Spring Boot/Tomcat mặc định tiêu thụ nhiều RAM. Để vận hành nhiều microservices trên container có tài nguyên giới hạn, các cờ JVM sau được áp dụng khi khởi chạy:

* -XX:+UseSerialGC — bộ thu gom rác đơn luồng, phù hợp container nhỏ.
* -Xss256k (hoặc 512k) — giảm bộ nhớ cấp phát cho mỗi ngăn xếp luồng.
* -XX:MaxRAMPercentage=70.0 — JVM chỉ dùng tối đa 70% RAM container làm Heap, chừa không gian cho hệ điều hành.
* spring.main.lazy-initialization=true và server.tomcat.threads.max=20 (thay vì 200 mặc định) để hạn chế lãng phí bộ nhớ khi rảnh rỗi.

## 6.6 An toàn mã QR điểm danh

* Payload QR không chứa dữ liệu thô mà là chuỗi được ký HMAC-SHA256 hoặc JWT ngắn hạn, gồm ticket\_id, event\_id và thời hạn — tránh giả mạo hoặc tạo vé giả bằng tay.
* Endpoint check-in là thao tác nguyên tử một lần dùng: cập nhật status = CHECKED\_IN với điều kiện WHERE status = 'VALID', tránh trường hợp một vé bị chụp màn hình và quét trùng nhiều lần.

## 6.7 Đồng bộ kiểu dữ liệu Frontend–Backend qua OpenAPI

Backend dùng springdoc-openapi để tự sinh OpenAPI spec; Frontend dùng openapi-typescript (hoặc orval) để sinh type TypeScript tự động trong pipeline CI. Cách này loại bỏ hoàn toàn rủi ro lệch DTO giữa hai phía so với việc định nghĩa Interface/Type bằng tay.

## 6.8 Chiến lược xác thực (Authentication)

Hệ thống dùng Microsoft Identity Platform (OAuth 2.0 / OpenID Connect qua thư viện MSAL), cấu hình single-tenant chỉ chấp nhận tài khoản thuộc tenant @tvu.edu.vn của trường, vì sinh viên TVU đã có sẵn tài khoản Microsoft 365 / Entra ID theo domain trường, thay vì tự xây dựng toàn bộ luồng đăng ký/đăng nhập/quên mật khẩu bằng tay. Sau khi xác thực thành công, hệ thống gọi Microsoft Graph (/me) lấy thông tin cơ bản (họ tên, email — phần trước @ là MSSV) rồi phát hành JWT nội bộ, lưu trong cookie HTTP-only, dùng cho các request tiếp theo qua API Gateway. Những thông tin không có trong tài khoản Microsoft (ví dụ mã lớp) được yêu cầu sinh viên bổ sung một lần sau lần đăng nhập đầu tiên. Cách này giảm đáng kể bề mặt tấn công (không tự lưu mật khẩu người dùng) và rút ngắn thời gian phát triển.

## 6.9 Kiểm thử tải (Load Testing)

Để có số liệu minh chứng cho mục tiêu "chịu tải cao", nhóm dùng công cụ mã nguồn mở k6 hoặc JMeter để giả lập hàng trăm đến hàng nghìn request đăng ký đồng thời vào Ticket-Service, đo tỷ lệ lỗi, số vé phát ra thực tế (đối chiếu có vượt số lượng cấu hình hay không) và thời gian phản hồi trung bình/p95. Kết quả kiểm thử tải được đưa vào báo cáo cuối kỳ như minh chứng số liệu, thay vì chỉ mô tả định tính.

## 6.10 Giám sát hệ thống (Monitoring)

Với tài nguyên VM giới hạn, hệ thống không triển khai bộ giám sát nặng (Prometheus/Grafana đầy đủ) mà dùng giải pháp nhẹ: Spring Boot Actuator (endpoint /actuator/health) kết hợp dịch vụ kiểm tra uptime miễn phí bên ngoài (UptimeRobot hoặc Better Stack) để cảnh báo khi service ngừng hoạt động, cùng với log có xoay vòng (log rotation) ghi trực tiếp trong container.

## 6.11 Phân quyền (RBAC), mô hình đa CLB và luồng duyệt đăng ký

Hệ thống áp dụng mô hình phân quyền theo vai trò (RBAC) kết hợp cô lập dữ liệu theo từng CLB (multi-tenant), để mỗi CLB chỉ thao tác trên dữ liệu của mình, đồng thời hỗ trợ luồng Ban tổ chức duyệt từng đăng ký.

### Ba nhóm vai trò:

SINH\_VIEN: đăng nhập bằng tài khoản @tvu.edu.vn, xem sự kiện và gửi đăng ký (tạo bản ghi ở trạng thái chờ duyệt).

ORGANIZER (Ban tổ chức CLB): gắn với một club\_id; tạo/cấu hình sự kiện, duyệt/từ chối đăng ký, quét QR điểm danh và xem dashboard riêng của CLB. Mỗi thành viên có một tài khoản cá nhân cùng thuộc CLB để phục vụ truy vết (audit log).

SUPER\_ADMIN (Quản trị viên nhà trường): tạo/khóa/xóa tài khoản CLB, đặt lại mật khẩu, quản lý danh mục CLB và xem thống kê toàn trường.

### Cô lập dữ liệu theo club\_id:

Mọi truy vấn của ORGANIZER đều bị ràng buộc theo club\_id gắn trong JWT; API Gateway và tầng service kiểm tra vai trò và club\_id trên mỗi request, đảm bảo một CLB không truy cập được sự kiện/đăng ký của CLB khác.

### Luồng trạng thái đăng ký:

Mỗi đăng ký đi qua các trạng thái: PENDING (sinh viên vừa gửi, chưa trừ vé) → APPROVED (Ban tổ chức duyệt, hệ thống giữ chỗ nguyên tử và phát vé — xem Mục 6.3) hoặc REJECTED (bị từ chối). Việc chốt số vé (giữ chỗ nguyên tử qua Redis) diễn ra tại bước duyệt, không phải lúc sinh viên gửi đăng ký.

# 7. CHIẾN LƯỢC TRIỂN KHAI HẠ TẦNG ĐÁM MÂY 0 ĐỒNG

Các lựa chọn hạ tầng dưới đây được kiểm chứng dựa trên tài liệu chính thức của từng nhà cung cấp tại thời điểm thực hiện đồ án (tháng 7/2026), vì thông tin gói miễn phí của các nền tảng cloud thường thay đổi theo thời gian.

## 7.1 Bảng lựa chọn hạ tầng

|  |  |  |
| --- | --- | --- |
| **Thành phần** | **Lựa chọn** | **Ghi chú / giới hạn thực tế** |
| Frontend hosting | Cloudflare Pages | Băng thông cho tài nguyên tĩnh không giới hạn ở gói miễn phí; ưu tiên chọn thay vì Vercel Hobby (giới hạn 100GB băng thông/tháng, chỉ dành cho mục đích phi thương mại). |
| Backend & API Gateway | Oracle Cloud Always Free (Ampere A1, kiến trúc ARM) | Gói Always Free đang trong quá trình được điều chỉnh giảm hạn mức tài nguyên; hệ thống được thiết kế để vận hành ổn định ở mức tài nguyên tối thiểu đã công bố, xem chi tiết và phương án dự phòng tại Mục 7.2. |
| CSDL chính | Neon (PostgreSQL) | Gói miễn phí không giới hạn thời gian, scale-to-zero khi không dùng; giới hạn dung lượng lưu trữ mỗi project — không lưu file/ảnh dạng blob trong CSDL, chỉ lưu metadata. |
| Message Broker | CloudAMQP — gói Little Lemur | Giới hạn khoảng 1 triệu message/tháng, tối đa ~20 kết nối đồng thời và ~100 queue; cần thiết kế consumer xử lý đủ nhanh để hàng đợi không tồn đọng. |
| Data Warehouse | Oracle Autonomous Data Warehouse (ADW) | Nằm trong gói Always Free của Oracle Cloud, dùng cho báo cáo/phân tích của Ban tổ chức. |
| Bộ đếm nguyên tử | Redis (Upstash / Redis Cloud free tier) | Dung lượng nhỏ nhưng đủ cho bộ đếm số vé và rate-limit counter. |
| Giám sát chi phí | Oracle Cloud Budget Alerts | Đặt ngưỡng cảnh báo ở mức 1 USD để phát hiện sớm mọi khả năng phát sinh hóa đơn ngoài ý muốn. |

## 7.2 Rủi ro hạ tầng và phương án dự phòng

Gói Always Free của Oracle Cloud cho instance kiến trúc ARM (Ampere A1) là thành phần hạ tầng có khả năng thay đổi hạn mức nhất trong toàn hệ thống. Do đó, đồ án chủ động áp dụng nguyên tắc thiết kế phòng thủ (defensive design): cấu hình JVM và số luồng xử lý (Mục 6.5) được tính toán để hệ thống vẫn chạy ổn định ở mức tài nguyên tối thiểu đã công bố chính thức, thay vì phụ thuộc vào mức tài nguyên tối đa. Nhóm chuẩn bị sẵn một VM dự phòng (ví dụ: gói Always Free của một nhà cung cấp cloud khác) với cùng cấu hình Docker Compose, cho phép chuyển đổi nhanh trong trường hợp khu vực triển khai chính không còn đủ tài nguyên cấp phát ("Out of host capacity").

# 8. KẾ HOẠCH THỰC HIỆN (SPRINT BACKLOG)

Dự án được chia thành 4 Sprint, phân công cho 3 thành viên theo vai trò chuyên trách. Các công việc được sắp xếp để mỗi Sprint kết thúc bằng một phần hệ thống chạy được (working increment), thuận lợi cho việc demo tiến độ.

## 8.1 Thành viên 1 — Frontend (React + TypeScript) & Analytics

|  |  |
| --- | --- |
| **Sprint** | **Công việc** |
| 1 | * Cấu trúc mã nguồn Monorepo, thiết lập giao diện React. * Thiết lập pipeline sinh TypeScript type tự động từ OpenAPI spec. |
| 2 | * Tích hợp đăng nhập qua Microsoft Entra ID (MSAL, giới hạn tenant @tvu.edu.vn), nhận JWT nội bộ. * Giao diện trang chủ tìm kiếm sự kiện; hiển thị số vé còn lại theo thời gian thực. |
| 3 | * Admin Dashboard (Recharts) phân tích phổ thời gian đăng ký. * Xử lý UX trạng thái "Đang xử lý" khi hệ thống tạo vé ngầm; hiển thị rõ lỗi khi hết vé/đăng ký trùng.   Giao diện Ban tổ chức duyệt/từ chối đăng ký; hiển thị trạng thái đăng ký (Chờ duyệt / Đã duyệt / Bị từ chối); dashboard lọc theo CLB (club\_id). |
| 4 | * Tích hợp quét QR điểm danh bằng camera trình duyệt (PWA, không cần app native). * Deploy Frontend lên Cloudflare Pages. |

## 8.2 Thành viên 2 — Backend Core & RabbitMQ

|  |  |
| --- | --- |
| **Sprint** | **Công việc** |
| 1 | * Khởi tạo Event-Service, Ticket-Service (Spring Boot). * Cấu hình springdoc-openapi để tự sinh API spec. |
| 2 | * Kết nối Neon PostgreSQL. * Viết logic đặt vé với giữ chỗ nguyên tử qua Redis (DECR) tại thời điểm Ban tổ chức duyệt đăng ký, kèm khóa lạc quan (@Version) làm lớp bảo vệ thứ hai. * Ràng buộc UNIQUE(event\_id, student\_id) và idempotency key cho request đăng ký.   Thiết kế RBAC (SINH\_VIEN / ORGANIZER / SUPER\_ADMIN), cô lập dữ liệu theo club\_id và luồng trạng thái đăng ký PENDING → APPROVED / REJECTED. |
| 3 | * Thiết lập RabbitMQ (Topic Exchange); Worker Service tạo mã QR đã ký HMAC/JWT. * Xuất dữ liệu danh sách sinh viên ra file CSV. * Viết script kiểm thử tải (k6/JMeter) cho luồng đăng ký. |
| 4 | * Tích hợp Java Mail Sender gửi vé tự động; cấu hình Dead Letter Queue cho lỗi gửi mail. * Xây dựng endpoint check-in QR dạng thao tác nguyên tử một lần dùng. * Chạy kiểm thử tải, ghi nhận số liệu vào báo cáo. |

## 8.3 Thành viên 3 — Cloud Architecture, API Gateway & Security

|  |  |
| --- | --- |
| **Sprint** | **Công việc** |
| 1 | * Lập trình Spring Cloud Gateway làm trung tâm điều hướng; cấu hình CORS chuẩn xác (không dùng \* khi có Credentials). * Khảo sát và chốt phương án hạ tầng dựa trên hạn mức Oracle Cloud tại thời điểm triển khai. |
| 2 | * Viết Dockerfile và docker-compose.yml; áp dụng cờ JVM Tuning tối ưu RAM và cấu hình luồng Tomcat. * Cấu hình RequestRateLimiter (Redis-backed) tại Gateway để chống spam/bot; kiểm tra vai trò (RBAC) và club\_id trong JWT trên mỗi request. |
| 3 | * Khởi tạo VM Oracle Cloud (thiết kế cho mức tài nguyên tối thiểu đã công bố). * Cấu hình CI/CD qua GitHub Actions để tự động build Docker image. * Chuẩn bị VM dự phòng với docker-compose sẵn sàng chuyển đổi. |
| 4 | * Tích hợp Oracle Object Storage lưu file CSV; thiết lập Budget Alerts (1 USD). * Thiết lập giám sát nhẹ: Actuator health-check + dịch vụ uptime-check miễn phí; theo dõi log xoay vòng. |

# 9. RỦI RO DỰ ÁN VÀ PHƯƠNG ÁN MVP

|  |  |  |
| --- | --- | --- |
| **Rủi ro** | **Mức ảnh hưởng** | **Phương án giảm thiểu** |
| Oracle Cloud giới hạn/thiếu tài nguyên cấp phát giữa kỳ | Cao | Thiết kế hệ thống chạy ổn ở mức tài nguyên tối thiểu đã công bố; có VM dự phòng đã cấu hình sẵn Docker Compose để chuyển đổi nhanh. |
| 3 thành viên không kịp hoàn thành đủ 3 service + Gateway + CI/CD + Dashboard trong 4 Sprint | Trung bình – Cao | Có thể gộp Notification-Service vào Ticket-Service (bớt 1 service riêng); lược giản phần Dashboard/ADW nếu cần; giữ lại luồng lõi: đăng ký vé → QR → điểm danh. |
| Redis là thành phần hạ tầng mới cần học thêm | Thấp – Trung bình | Nếu không kịp tích hợp Redis, dùng SELECT ... FOR UPDATE trong PostgreSQL làm lớp chống overbooking thay thế tối thiểu. |
| Hàng đợi RabbitMQ tồn đọng nếu consumer xử lý chậm hơn tốc độ publish | Trung bình | Giới hạn số message đang chờ (theo dõi qua Dashboard CloudAMQP); tăng số consumer song song nếu cần. |

# 10. DỰ KIẾN KẾT QUẢ ĐẠT ĐƯỢC

* Hệ thống web hoàn chỉnh cho phép sinh viên đăng ký sự kiện, nhận vé QR, và Ban tổ chức quét mã điểm danh, được triển khai công khai trên hạ tầng đám mây.
* Số liệu kiểm thử tải minh chứng khả năng chịu tải và tính đúng đắn của cơ chế chống overbooking.
* Mã nguồn được tổ chức theo kiến trúc Microservices rõ ràng, có CI/CD tự động, sẵn sàng để tiếp tục phát triển sau đồ án.
* Báo cáo đồ án trình bày đầy đủ quá trình thiết kế, các quyết định kỹ thuật và cơ sở lựa chọn (bao gồm các rủi ro hạ tầng đã nhận diện và xử lý).

# 11. TÀI LIỆU THAM KHẢO

[1] Spring Cloud Gateway Reference Documentation. https://docs.spring.io/spring-cloud-gateway/

[2] RabbitMQ Documentation. https://www.rabbitmq.com/docs

[3] CloudAMQP — Plans & Pricing. https://www.cloudamqp.com/plans.html

[4] Oracle Cloud — Always Free Resources Documentation. https://docs.oracle.com/en-us/iaas/Content/FreeTier/

[5] Neon Docs — Plans & Pricing. https://neon.com/docs/introduction/plans

[6] Cloudflare Pages — Limits. https://developers.cloudflare.com/pages/platform/limits/

[7] Vercel Docs — Limits. https://vercel.com/docs/limits

[8] Nx — Java/Spring Boot Support. https://nx.dev/java

[9] Supabase Docs — Pricing & Free Tier. https://supabase.com/pricing