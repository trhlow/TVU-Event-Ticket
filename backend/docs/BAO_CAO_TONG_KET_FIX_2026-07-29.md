# Báo cáo tổng kết — thi công checklist AUTH_OTP_FIX (28–29/07/2026)

Nhánh: `hlow` (local) · phạm vi đợt fix `26a9896..d0ce623`:
**25 commit · 154 file · +6.050 / −1.634 dòng**.
(Tính từ `origin/hlow` = `31622c3` thì là 26 commit / 158 file / +8.956 / −1.604
— khác baseline, đừng trộn hai bộ số.)

> ⛔ **Trạng thái release: ĐỎ — chưa sẵn sàng production.**
>
> **Toàn bộ thay đổi mới chỉ tồn tại trên nhánh local.** Chưa push, chưa merge,
> chưa có lượt CI nào chạy trên các commit này. Tại thời điểm viết:
> local `hlow` = `8538ad4`, đi trước `origin/hlow` (`31622c3`) **27 commit**;
> `origin/main` = `8cef2d7`. Mọi con số test dưới đây là kết quả chạy trên máy
> local, **không phải** trạng thái GitHub hay production.

---

## 1. Tóm tắt trong một đoạn

Checklist `AUTH_OTP_FIX_CHECKLIST_VI.md` có 32 mục (3 Critical, 14 High,
14 Medium, 1 Low). **29 mục đã có implementation, code hoặc tài liệu** — nhưng
theo đúng tiêu chí đóng mục của chính checklist thì con số phân rã là:

- **22 mục đóng hoàn toàn.**
- **7 mục mới xong một phần** (C3, H1, H7, H8, H10, H13, H14) — còn chờ chạy
  thật trên máy chủ, chờ diễn tập, hoặc chờ test còn thiếu.
- **3 mục chưa bắt đầu** (M2, M5, M13).

Bảng đầy đủ ở mục 5. Bản trước của báo cáo này ghi "28 mục hoàn thành, còn 4
mục" — cách đếm đó **sai**: nó gộp "đã có code" thành "đã đóng", và tính test
deadlock còn thiếu như một mục thứ 33 độc lập thay vì như bằng chứng còn nợ của
H7/H8.

Toàn bộ test local đang xanh: backend **326 pass / 0 fail / 0 skipped**,
frontend **100 pass**, lint và typecheck sạch, cổng kiểm tra bundle đạt 4/4.

---

## 2. Những gì đã sửa, nói bằng ngôn ngữ thường

### Nhóm nghiêm trọng nhất (Critical)

**Ai cũng deploy thẳng lên production được.** Trước đây chỉ cần push lên `main`
là hệ thống tự deploy, chạy song song với CI — nghĩa là code có thể lên
production *trước khi* test chạy xong, hoặc *bất chấp* test fail. Giờ deploy chỉ
xảy ra khi có người bấm nút, phải nhập đúng mã commit 40 ký tự, và hệ thống tự
kiểm tra commit đó có đúng là đỉnh nhánh `main` không, CI và CodeQL của **chính
commit đó** đã xanh chưa, còn cảnh báo bảo mật nào chưa xử lý không. Nhánh `main`
cũng đã được khoá lại: bắt buộc qua Pull Request, bắt buộc có người duyệt, và
quy định này áp dụng cho cả admin.

**Dữ liệu ảo bị đóng gói vào bản production.** Đây là mục tôi nghĩ bạn nên đọc
kỹ nhất. Cờ `VITE_USE_DEMO_DATA=false` chỉ quyết định *nhánh nào chạy*, nhưng
toàn bộ dữ liệu giả vẫn được đóng gói và **tải về máy mọi người dùng** — bao gồm
17 địa chỉ email, trong đó có **một địa chỉ Gmail cá nhân thật**. Tôi đã gỡ hẳn
chế độ demo khỏi 7 service, chuyển dữ liệu giả sang thư mục test. Đo lại bản
build: từ 3 gói dữ liệu giả xuống **0**, từ 17 email xuống **2** (đều là địa chỉ
liên hệ thật của trường). Kèm theo là một cổng kiểm tra tự động chạy trong CI và
cả khi build image, nên lỗi này không quay lại được.

**Chưa có quy trình làm sạch dữ liệu trước khi mở hệ thống.** Đã viết runbook
đầy đủ (`CLEAN_SLATE_CUTOVER_VI.md`) theo mô hình blue-green: dựng hệ thống mới
song song, kiểm thử, rồi mới chuyển traffic — thay vì xoá tại chỗ và không có
đường lùi. Kèm script đếm dữ liệu hiện có để chứng minh "không còn gì cần giữ"
bằng số liệu, không bằng trí nhớ.

### Nhóm đăng nhập / phiên (High)

**Đăng xuất khỏi mọi thiết bị rồi đăng nhập lại thì bị chặn 15 phút.** Cơ chế cũ
đánh dấu "user này bị thu hồi" trong 15 phút và từ chối **mọi** token của họ, kể
cả token vừa cấp cho lần đăng nhập mới. Đã thay bằng một con số phiên bản lưu
trong database: token cũ bị từ chối, token mới dùng được ngay.

**Câu lạc bộ bị vô hiệu hoá nhưng ban tổ chức vẫn đăng nhập được.** Trước đây tắt
CLB chỉ đổi trạng thái CLB, không đụng tới tài khoản, nên người của CLB đó chỉ
cần xin mã OTP mới là làm việc bình thường. Giờ họ bị chặn ở cả ba đường vào, và
các phiên đang mở cũng bị huỷ ngay.

**Mã OTP lưu dạng chữ thường trong Redis.** Ai đọc được Redis — qua backup, qua
dòng lệnh, qua một container khác cùng máy — là lấy được mã đăng nhập của admin
và vào thẳng. Mà admin **không có mật khẩu dự phòng**, nên mã đó chính là cả cánh
cửa. Giờ chỉ lưu bản mã hoá kèm một khoá bí mật riêng.

**Hai người nhập cùng một mã OTP đúng thì cả hai đều vào được.** Việc kiểm tra mã
gồm nhiều bước rời rạc nên hai request đồng thời chen được vào giữa. Đã gộp thành
một thao tác nguyên tử.

**Token cũ vẫn khai được mã số sinh viên cũ.** Sinh viên đã xác minh MSSV A, giữ
lại token, đổi sang MSSV B (chưa xác minh), rồi dùng token cũ để đặt vé — hệ
thống vẫn cho qua và ghi nhận theo MSSV A. Giờ mọi thay đổi thông tin quan trọng
đều huỷ token cũ.

**Đăng xuất một thiết bị lại đăng xuất tất cả.** Đã sửa để chỉ kết thúc đúng
trình duyệt đang bấm nút.

**Email vé có thể gửi trùng hoặc mất mà không ai biết.** Bằng chứng "email này đã
gửi rồi" chỉ nằm trong Redis với hạn 30 ngày, không liên quan gì tới bản backup
database. Khôi phục database rồi dựng Redis rỗng thì chỉ còn hai lựa chọn, đều
sai: gửi lại tất cả (sinh viên nhận vé hai lần) hoặc không gửi gì (mất vé). Đã
chuyển sổ ghi nhận này vào chính database, nên nó đi theo bản backup. Kèm quy
trình xử lý các trường hợp "không biết đã gửi hay chưa" — có người trực, có thời
hạn, có các bước cụ thể.

### Nhóm hạ tầng (High)

- Container frontend chạy quyền `root` → chuyển sang tài khoản thường.
- Ứng dụng dùng chính tài khoản **sở hữu** database, tức một lỗ hổng có thể xoá
  sạch cấu trúc dữ liệu → tách thành hai tài khoản, ứng dụng chỉ đọc/ghi.
- Mọi image nền dùng tag có thể thay đổi → **toàn bộ base image trong hai
  Dockerfile, các image dịch vụ bên thứ ba trong Compose production và mọi
  GitHub Action đã được pin bằng digest/SHA** — đạt *mức tối thiểu* của H10.
  **Image ứng dụng vẫn được build lại trên VPS** (`deploy.sh:20-24` tự ghi nhận),
  nên **H10 chưa đóng** và chưa thể khẳng định "deploy lại cùng một commit ra
  cùng kết quả". Đích đến vẫn là build một lần trong CI → đẩy lên registry →
  deploy bằng digest. Compose dev nằm **ngoài phạm vi H10** và hiện chưa pin.
  - Ghim cuối cùng còn thiếu là RabbitMQ, pin ngày 29/07 (`@sha256:a51ed990cb43…`
    → upstream 4.2.9). Vì pin đồng nghĩa **đóng băng cả bản vá bảo mật**, chính
    sách bump digest (ai chịu trách nhiệm, tần suất, quy trình) đã ghi vào
    `OPERATIONS.md`.
- Khôi phục database có thể để hệ thống ở trạng thái nửa vời → đổi tên script cho
  đúng phạm vi thật và chặn không cho chạy thẳng lên production.
- Nếu nhà cung cấp email chết thì **không ai** vào được hệ thống quản trị, kể cả
  dùng lệnh SQL khẩn cấp (vì admin mới vẫn phải nhận mã qua email đó) → đã thêm
  **cơ chế, cấu hình mẫu và runbook** chuyển sang SMTP dự phòng (script đổi
  provider, biến môi trường mẫu, checklist diễn tập). Nhưng credential vẫn là
  placeholder và **provider thật chưa từng được diễn tập** — nên H14 chưa đóng,
  và kéo theo H1 cũng chưa đóng.

### Nhóm vừa (Medium)

Chặn giả mạo bản ghi kiểm toán, giới hạn tần suất cho endpoint còn thiếu, sửa CSP
đang chặn chính font và ảnh của trang, thống nhất phiên bản Node giữa ba nơi, bỏ
`|| true` khiến kiểm tra bảo mật trong CI luôn xanh, và vá lỗ khiến một thay đổi
chỉ chạm CI có thể làm **cả hai** job bị bỏ qua mà cổng vẫn báo đạt.

---

## 3. Cách tôi kiểm chứng, và ba lần suýt báo cáo sai

Tôi cố gắng không nói "xong" khi chỉ mới "chạy không lỗi". Vài ví dụ cụ thể:

**Lần 1 — Docker tắt giữa chừng.** Một lần chạy test cho ra "3 lỗi, 58 test bị
bỏ qua", nhìn như tôi vừa làm hỏng gì đó. Thực tế Docker Desktop đã tắt giữa hai
lần chạy, và các test cần database thật thì **bị bỏ qua trong im lặng**. Nếu chỉ
nhìn dòng "0 failures" của lần đó thì đã kết luận sai hoàn toàn. Tôi bật lại
Docker và chạy lại mới ra kết quả thật.

**Lần 2 — cấu hình có vẻ đúng nhưng chưa có hiệu lực.** Khi loại file cấu hình
demo khỏi bản đóng gói, lần kiểm tra đầu vẫn thấy file đó nằm trong gói. Nguyên
nhân: thư mục build còn bản cũ, phải xoá đi build lại mới đúng. Nếu tin lần chạy
đầu thì đã kết luận **ngược hẳn** với sự thật.

**Lần 3 — file quan trọng không được đưa vào Git.** File cấu hình chuẩn cho bản
production bị quy tắc `.gitignore` loại ra. Nếu không kiểm tra lại sau khi thêm,
file sẽ không có trong repo, CI và Docker sẽ không thấy nó, và cái gọi là "một
nguồn duy nhất" sẽ **im lặng không tồn tại** — đúng loại lỗi mà việc này sinh ra
để dọn.

Ngoài ra, với những đoạn code khó tin là "đã đúng", tôi chủ động **làm hỏng lại**
để xem test có bắt được không:

- Gộp hai nhánh xử lý cookie bị đánh cắp → đúng một test đỏ, khôi phục thì xanh.
- Thay cơ chế kiểm tra OTP nguyên tử bằng cách cũ → đúng hai test đồng thời đỏ.

Nếu test không đỏ trong các phép thử đó, tức là nó không canh gì cả.

---

## 4. Những chỗ tôi làm khác checklist (và vì sao)

Bốn chỗ tôi không làm y hệt văn bản. Tất cả đều đã ghi lý do vào checklist, nêu
lại ở đây để bạn dễ bác nếu không đồng ý:

1. **Bỏ luôn khoá Redis trong luồng gửi email**, dù checklist nói "Redis chỉ còn
   giữ lock ngắn hạn". Lý do: sổ ghi nhận trong database đã tự mang cả chức năng
   khoá lẫn hạn giữ. Giữ song song hai cơ chế với hai thời hạn khác nhau chính là
   kiểu trùng lặp đã sinh ra mớ rắc rối này.
2. **Không chuyển `MOCK_DATA_REMOVAL_SURVEY_VI.md` vào `backend/docs/`.** Tài
   liệu đó nói về frontend, và `docs/` ở gốc vốn đã là nơi chứa tài liệu
   frontend. Chuyển đi là *tạo ra* lệch chuẩn chứ không phải sửa.
3. **Không bật "cấm tự duyệt" cho môi trường production.** Repo chỉ có một
   admin; bật lên là tự khoá, không còn ai duyệt được deploy. Nên bật lại ngay
   khi có người thứ hai.
4. **Không tạo file spec riêng** cho từng hạng mục. Bản thân checklist đã là
   spec; thêm tài liệu song song sẽ tái tạo đúng vấn đề "nhiều nguồn sự thật
   lệch nhau" mà chính checklist phải đi dọn.

Một điểm nữa đáng lưu ý: **tôi đã sửa lại một số test cũ vì chúng khẳng định
hành vi sai**, chứ không phải vì chúng cản đường. Ví dụ có test khẳng định
"cookie bị đánh cắp thì thu hồi mọi thiết bị" — đó chính là lỗ hổng cần bỏ; và
một test khẳng định "đăng nhập bằng email trùng với admin thì tạo tài khoản sinh
viên mới" — trái với quyết định đã chốt. Test xanh mà mô tả sai thực tế còn tệ
hơn không có test.

---

## 5. Những mục CHƯA đóng được

### 5.1 Ba mục chưa bắt đầu

| Mục | Nội dung | Vì sao chưa |
|---|---|---|
| **M2** | Chống dò email bằng cách xử lý mọi request qua cùng một đường | Cần viết lại luồng gửi OTP theo kiểu bất đồng bộ, đụng vào đường đăng nhập. Rủi ro cao, nên tôi không làm khi bạn không có mặt để xem xét. |
| **M5** | Ghi nhận mã commit thật đang chạy trên máy chủ | **Cần truy cập VPS**, tôi không có. Đây là việc phải làm trực tiếp trên máy chủ. |
| **M13** | Dựng Prometheus/Grafana + cảnh báo thật | Là hạng mục hạ tầng riêng, cần quyết định về công cụ và chi phí. |

### 5.2 Bảy mục mới xong một phần — **không được tính là hoàn tất**

| Mục | Đã có | Còn thiếu để đóng |
|---|---|---|
| **C3** | Runbook clean-slate blue-green + script đếm dữ liệu | Chưa chạy inventory thật, chưa cutover production |
| **H1** | Đường khôi phục quyền admin + checklist nghiệm thu | Checklist quy định H1 **chỉ đóng sau khi H14 đã cấu hình và diễn tập thành công** |
| **H7** | Khoá theo id tăng dần khi vô hiệu hoá CLB | **Test deadlock** `refresh()` ⟂ `deactivateClub()` — đây là bằng chứng đóng H7, không phải một mục riêng |
| **H8** | Version phiên trong DB + trusted-device lineage | Cùng test deadlock trên; checklist ghi rõ H8 vẫn dừng ở bước 3c |
| **H10** | Đạt *mức tối thiểu*: pin digest toàn bộ base image (2 Dockerfile + 4 image dịch vụ trong Compose production, RabbitMQ pin 29/07) và pin SHA mọi GitHub Action | Image ứng dụng vẫn build trên VPS lúc deploy → chưa build-once-in-CI / deploy-by-digest, chưa reproducible-by-construction |
| **H13** | Mới xong **H13.1** (delivery ledger trong PostgreSQL) | Chưa diễn tập restore cho **cả hai loại message**; chưa chạy drill có kiểm quyền |
| **H14** | Script chuyển provider, biến cấu hình mẫu, runbook + checklist rehearsal | Credential vẫn là placeholder; **provider dự phòng chưa từng được cấu hình và diễn tập** |

### 5.3 Follow-up phát sinh **ngoài phạm vi** checklist

Phát hiện trong lúc thi công, **không** được thêm vào `AUTH_OTP_FIX_CHECKLIST_VI.md`
(file đó là biên bản của đợt review AUTH_OTP, giữ nguyên 32 mục):

| Mức | Nội dung |
|---|---|
| **Medium** | **RabbitMQ lệch phiên bản giữa ba môi trường**: dev `docker-compose.monolith.yml:17` = **3**-management-alpine, Testcontainers `AbstractRabbitIntegrationTest.java:29` = **4.1**, production = **4.2.9**. Test đang chứng minh hành vi trên một phiên bản khác với phiên bản chạy thật. Cần đồng bộ dev + Testcontainers lên ngang production, rồi **chạy lại toàn bộ test notification / retry / DLQ** — đó mới là phần rủi ro, không phải việc đổi tag. Cố ý **không** gộp vào commit pin digest. |

### 5.4 Việc phải làm trên máy chủ thật

- Chạy script đếm dữ liệu để chốt việc làm sạch (C3).
- Cấu hình và diễn tập nhà cung cấp email dự phòng — cấu hình chưa từng thử
  không phải là phương án dự phòng (H14 → H1).
- Diễn tập khôi phục database vào một hệ thống tạm, cả hai loại message (H13).

---

## 6. Hai việc cần bạn quyết trước khi deploy

1. **Cổng deploy đang chặn (đúng thiết kế).** Cảnh báo bảo mật `#5` vẫn ở trạng
   thái mở trên nhánh `main`. Tôi đã sửa lỗi đó trên `hlow`, nhưng cảnh báo chỉ
   tự đóng khi bản sửa vào `main` và CodeQL chạy lại. Trước lúc đó, cổng deploy
   sẽ từ chối — đây là hành vi mong muốn, không phải lỗi.

2. **Pull Request từ nhánh cũ sẽ bị treo.** Hai kiểm tra bắt buộc mới
   (`ci-gate`, `codeql-gate`) chỉ tồn tại ở các nhánh đã có workflow mới. PR mở
   từ nhánh chưa rebase sẽ đứng mãi ở trạng thái "Expected". Rebase lên `hlow`
   là hết.

---

## 7. Trạng thái kiểm thử cuối cùng

| Hạng mục | Kết quả |
|---|---|
| Backend | **326 pass / 0 fail / 0 skipped** |
| Frontend | **100 pass** (18 file) |
| Lint + typecheck frontend | sạch |
| Cổng kiểm tra bundle | 4/4 đạt |
| Migration | V1 → **V15**, đúng thứ tự, có test chạy trên dữ liệu thật |

Một lưu ý nhỏ: test `QrSignerTest` **thỉnh thoảng đỏ**. Test có dùng
`UUID.randomUUID()` và `Instant.now()`, nên tôi **nghi ngờ** nguyên nhân là dữ
liệu ngẫu nhiên mỗi lần chạy khiến thư viện đọc mã QR đôi khi giải mã trượt —
nhưng **chưa chứng minh được**: lượt clean test gần nhất vẫn xanh, chưa tái hiện
được lỗi. Đây là hiện tượng **có sẵn từ trước**, không liên quan tới đợt sửa
này. Hướng xử lý đề xuất (dùng dữ liệu cố định) cần được kiểm chứng bằng một
lượt chạy lặp nhiều lần trước khi kết luận.
