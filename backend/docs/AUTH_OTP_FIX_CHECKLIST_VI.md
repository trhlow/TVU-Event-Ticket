# Checklist fix — review OTP/auth-method + deploy gate (v17, chốt 2026-07-28)

> **v17** (2026-07-28) — hai lưu ý triển khai của H13.1, không thêm finding
> mới, phân loại vẫn **C 3 / H 14 / M 14 / L 1**:
> 1. **Contract `TicketMailSender`**: `SmtpTicketMailSender.java:46-47` bắt mọi
>    `Exception` gói thành một `IllegalStateException` và `send()` trả `void`
>    → worker không phân biệt được lỗi trước/sau `DATA`, nên protocol 3 pha của
>    v16 **không thi hành được**. Đã yêu cầu phân loại
>    `ACCEPTED` / `RETRYABLE_BEFORE_DATA` / `AMBIGUOUS`, mặc định `AMBIGUOUS`.
> 2. **Alert `UNKNOWN`**: `notification_ledger_unknown_total > 0` (v16) là
>    alert sai — counter tích luỹ nên đỏ vĩnh viễn sau khi xử lý xong và reset
>    khi restart. Đã tách thành gauge đọc-DB (backlog hiện tại) + `increase(...
>    [5m])` (UNKNOWN mới phát sinh).
>
> **v16** (2026-07-28) không thêm finding mới — gộp 3 đính chính vào H13.1,
> H11 và phần rollback. Phân loại giữ nguyên: **C 3 / H 14 / M 14 / L 1**.
> 1. **H13.1**: failpoint test cũ assert `UNKNOWN` ngay sau khi kill process —
>    **bất khả thi**, không ai ghi được state khi process đã chết. Đã chốt
>    protocol 3 pha (TX1 claim `PROCESSING` + lease → SMTP ngoài transaction →
>    TX2 kết luận → reconciler mới sinh `UNKNOWN`), và test tách hai giai
>    đoạn. Kèm quy tắc: lỗi **sau** `DATA` = `UNKNOWN`, không phải `FAILED`.
> 2. **H13.1**: nhãn `at-least-once` trống mâu thuẫn với chính quyết định
>    không auto-retry `UNKNOWN` (⇒ email **có thể mất**). Đã tách semantics
>    theo hai nhánh + yêu cầu SLA reconciliation thủ công và alert.
> 3. **H11**: chỉ nói "tách vai trò" mà không định nghĩa grant → bảng do
>    migration sau tạo ra sẽ không đọc/ghi được. Đã bổ sung CONNECT/USAGE/DML,
>    `ALTER DEFAULT PRIVILEGES`, tái cấp quyền sau `pg_restore --no-owner
>    --no-privileges`, và cấm credential owner nằm trong container runtime.
>
> **v15** gộp vòng review toàn repo (không chỉ phần vừa sửa). Thêm: quyết định
> clean-slate vs data-migration (giải mâu thuẫn C3↔H3), H9–H14 (JWT giữ MSSV
> cũ, artifact không tái lập được, Postgres owner ở runtime, frontend chạy
> root, restore nửa vời, break-glass phụ thuộc SMTP), M7–M14 và L1.
>
> ⛔ **Các đính chính trong chính v15** (giữ lại để không ai "phát hiện lại"):
> 1. Đã LOẠI nhầm finding metadata mTLS với lý do "đó là metadata của Microsoft
>    Entra" — **SAI**. Endpoint `/.well-known/oauth-protected-resource` do
>    `spring-security-oauth2-resource-server` tự đăng ký trên chính domain của
>    ta. Đã chuyển thành **L1**, kèm bằng chứng bytecode.
> 2. H9 từng yêu cầu bump `auth_version` khi đổi `displayName` — **vô ích**,
>    JWT không mang claim đó. Thứ bị bỏ sót là **`email`**. Đã sửa phạm vi H9.
> 3. H8 để mở "`device_family_id` hoặc `replaced_by`", M1 nói "generation" mà
>    không định nghĩa trường — đã **chốt cứng** `V14__trusted_device_lineage`
>    dùng chung cho cả hai.
> 4. H13 tưởng preflight là đủ chống "nửa restore" — đã đổi sang **blue-green**
>    như C3.
> 5. Sơ đồ migration mô tả lệch ở 4 chỗ (V13 vs V14, M8 sau H3) — đã gom về
>    **C3.-1** làm nguồn duy nhất.

> ⚠️ **File này là KẾ HOẠCH, chưa phải implementation.** Tính đến 2026-07-28
> repo mới có migration V1–V11; `V12__users_auth_version.sql`,
> `V13__users_auth_identity_constraint.sql` và
> `V14__trusted_device_lineage.sql` **chưa tồn tại**, và **chưa mục nào trong
> C1–C3 / H1–H14 / M1–M14 / L1 được code**. Đừng đọc file này như báo cáo tiến
> độ. (v14 ghi "C1–C3/H1–H8/M1–M6" — sót toàn bộ nhóm thêm ở v15.)

Kết quả review nhiều vòng trên nhánh `hlow`, đã kiểm chứng từng finding trên
code thật (v3 siết C1 verify SHA, H4 phạm vi catch, H5 idempotent, H6 tách
config/DB validation, M2 full-enqueue; v4 sửa kết luận sai của v3 về logout —
`permitAll` KHÔNG đủ vì bearer resolver chặn trước authorization).

**v14** (2026-07-28, vòng review thứ mười bốn):
- **H7** — đính chính lần hai: token lỡ mint trong race KHÔNG "vô dụng", nó
  **hợp lệ trở lại sau unlock/reactivate** nếu không bump version lần nữa. Vì
  vậy phải làm cả hai: đóng race trước mint, VÀ tăng `auth_version` khi
  unlock/reactivate. Test phải assert sau khi mở khóa.
- **H8** — **chốt phương án (a)** (khóa user row) cho trusted device; nếu
  dùng (b) generation thì successor và JWT phải giữ nguyên `g` lấy từ
  `exchange`, cấm re-read user (đó chính là đường race), và phải chốt số
  migration ngay (cột vào V12 hay tạo V14).
- **M1 (mới)** — replay cookie cũ có thể **DoS device mới**: `exchange()` coi
  mọi `revokeIfActive == 0` là replay rồi `revokeAll()`. Phân biệt replay
  thời kỳ hiện hành với device thời kỳ đã thu hồi.
- **C3** — alias duy nhất là **bắt buộc**; "hai network riêng" một mình không
  đủ. Định nghĩa lại "no-write" cho khớp với chính các test bắt buộc (cần
  đường bypass cho operator).
- Bỏ nốt số GitNexus còn sót (bị xuống dòng giữa "38" và "symbol" nên grep
  trước đó trượt).

**v13** (2026-07-28, vòng review thứ mười ba):
- **H8 (mới, bảo mật)** — race trusted-device: `revokeAll()` chỉ revoke row
  có sẵn lúc query, còn `refresh()` insert successor SAU đó → sau
  sign-out-all/lock/deactivate người dùng vẫn giữ được cả JWT lẫn device
  cookie. Chốt hai thiết kế (lock user row, hoặc generation kiểm nguyên tử
  trong `exchange`) + latch test.
- **C3** — external network dùng chung có thể trộn traffic v1/v2 vì Caddyfile
  trỏ tên trần `monolith`/`frontend`; bắt buộc alias `-v1`/`-v2` hoặc hai
  network riêng. Thêm định nghĩa **commit point**: giai đoạn A no-write +
  smoke công khai (rollback an toàn), giai đoạn B mở ghi (sau đó chỉ
  roll-forward).
- **H8** — bỏ nốt câu "Redis lỗi thì đọc DB"; validator `auth_version` không
  có phụ thuộc Redis.
- **Gate** — Node lệch nhau: `Dockerfile:1` dùng `node:24-alpine` còn
  `ci.yml:121` dùng 22, nên gate xanh không chứng minh artifact thật.
- **Sửa câu chữ** — `pg_dump` vẫn nhất quán khi DB đang ghi (MVCC); vấn đề
  thật là RPO, không phải "backup hỏng".
- Bỏ nốt số symbol GitNexus còn sót ở `activeAdmin`.

**v12** (2026-07-28, vòng review thứ mười hai):
- **H5/M3** — bỏ nốt hai chỗ còn gọi lại cơ chế Redis mà H8 đã loại
  (sign-out-all gọi `tokenRevocationService.revoke`, deactivate "revoke JWT");
  thêm mục dọn `RevokedTokenValidator`/`TokenRevocationService` khỏi đường
  validate sau khi H8 xong.
- **C3** — xử lý xung đột cổng: `compose.yaml:10-11` bind `80:80`/`443:443`
  nên stack v2 y nguyên sẽ không khởi động; chốt kiến trúc edge Caddy dùng
  chung (hoặc override bỏ public port ở v2). Đính chính cookie: `TVU_AUTH` và
  `TVU_DEVICE` là HttpOnly nên FE không tự xóa được, phải để backend
  `Set-Cookie` `Max-Age=0`.
- **H7-B** — bỏ lập luận sai "cùng chạm một row nên DB serialize"; `SELECT`
  thường không khóa row. Ghi rõ hệ quả thật (token lỡ mint vẫn 401 ngay) và
  hai cách nếu muốn chặn từ đầu.
- **C2** — 3 storage key mock tách thành hai giai đoạn để không tự mâu thuẫn
  với module cleanup của C3; lệnh tái hiện phải dùng script build production
  đủ biến, không chỉ `VITE_USE_DEMO_DATA=false`; gỡ nốt PII còn nguyên văn ở
  phần Git history.
- **GitNexus** — bỏ hẳn số symbol khỏi tài liệu (phụ thuộc target/UID, các
  bản trước ghi 38/39 nhưng đo lại cho ~11); giữ mức rủi ro, yêu cầu chạy
  `impact` tại chỗ.
- **Changelog v9** — đính chính "17 email trong userService" → 14 trong
  `userService`, 17 toàn bundle.

**v11** (2026-07-28, vòng review thứ mười một):
- **C3** — quy trình cutover cụ thể: `compose.yaml:1` cố định project name và
  volume nên "chạy lại" sẽ tái dùng dữ liệu cũ → phải dựng stack v2 song song;
  dừng hẳn monolith/workers trước backup cuối; không purge Rabbit cũ; stack cũ
  **stopped** chứ không "read-only"; rollback đồng bộ cả 4 thành phần.
  Đính chính localStorage: phiên nằm ở cookie, chỉ có **3 key mock** cần
  `removeItem()`, hard reload không xóa được.
- **C2** — sửa số liệu (14 trong `userService`, 17 tổng); gỡ địa chỉ Gmail cá
  nhân khỏi tài liệu; gate 4 phần thay cho "không còn chuỗi email"; bỏ Maven
  profile loại class demo (sẽ vỡ build vì `ProductionSecretsValidator:6,32`).
- **H8** — `authVersion` phải là field RIÊNG, không tái dùng `@Version`
  (`User.java:31-33`), nếu không sửa hồ sơ cũng đăng xuất người dùng; thêm ca
  test `1.5`; dọn câu "cache hit Redis, miss DB" còn sót.
- **M6** — banner chưa hoạt động end-to-end (`toEventRequest` không gửi, BE
  không có trường, đọc về luôn rỗng), không chỉ là chuyện CSP.
- **Thứ tự** — M1–M4 → **M1–M6**, M6 trước khi dựng bundle cuối, M5 là điều
  kiện trước cutover.

**v10** (2026-07-28, vòng review thứ mười):
- **C2** — mở rộng sang **backend JAR** (đóng gói `application-dev.yml` +
  `DemoOtpProperties`/`FixedOtpCodeIssuer`); sửa cách mô tả bằng chứng
  (`frontend/dist` bị `.gitignore`, không phải artifact trong repo) và thêm
  lệnh build tái hiện kèm SHA; ghi nhận email cá nhân đã nằm trong lịch sử Git
  từ `48c7ee6` → cần history rewrite tách riêng.
- **Thứ tự** — chèn C3 (thiết kế) ở bước 0, C2 ở bước 1b, thực thi C3 thành
  bước 8 trong maintenance window cuối.
- **Dọn mâu thuẫn còn sót** — H7 không còn nói "Redis chỉ là cache"; bảng LOẠI
  không còn trỏ về `session_issued_at_ms`; số symbol GitNexus (**đã bỏ hẳn ở
  v12** — con số phụ thuộc target/UID, xem ghi chú trong H8).
- **H8** — thêm test claim dị dạng (thiếu/chuỗi/âm/tràn/`sub` không phải UUID/
  DB lỗi).

**v9** (2026-07-28, vòng review thứ chín):
- **H8** — bỏ cache-aside: cache hit cũ vẫn **phê duyệt** được token đã thu
  hồi. Phiên bản đầu đọc DB mọi request; Redis lỗi thì bỏ qua Redis chứ không
  fail-closed (v8 ghi vậy sẽ để Redis chết kéo sập toàn bộ auth).
- **C2 (mới)** — dữ liệu ảo NẰM TRONG bundle production, không chỉ sau một cờ:
  3 chunk `mock*` + email fixture trong bundle. (Số liệu bản v9 ghi "17 email
  trong `userService`" — **đã sửa ở v11**: 14 trong `userService`, 17 là tổng
  toàn bundle.)
- **C3 (mới)** — chưa có quy trình clean-slate DB/Redis/RabbitMQ/bootstrap.
- **H6** — preflight phải cấm `example.com` và email demo, nếu không reset DB
  xong sẽ tự sinh lại SUPER_ADMIN ma.
- **M6 (mới)** — CSP production chặn Google Fonts và banner Unsplash mà chính
  frontend đang dùng.
- **Gate cuối** — ghi rõ trạng thái đo được: ĐỎ (4 error, 58 skipped, Docker
  daemon tắt nên test DB bị bỏ qua im lặng).

**v8** (2026-07-28, vòng review thứ tám):
- **H8** — hợp nhất nguồn sự thật về **PostgreSQL `users.auth_version`**; v7
  để H7 chốt DB còn H8 chốt Redis, hai thứ không commit nguyên tử với nhau và
  TTL của Redis lại giết nhầm token hợp lệ. Redis hạ xuống cache-aside,
  fail-closed.
- **H3/H8** — chốt đánh số migration: **V12 = `users_auth_version` (H8)**,
  **V13 = `users_auth_identity_constraint` (H3)**, tránh Flyway out-of-order
  do H8 thi công trước.
- **C1** — deploy thường phải đúng đỉnh `origin/main` (ancestor check nhận cả
  commit cũ); chốt thứ tự chọn workflow run (chọn latest TRƯỚC khi xét
  conclusion, nếu không là fail-open).
- **H7** — cấm cho Microsoft login dùng chung predicate admin (sẽ khóa toàn
  bộ sinh viên sau H3).
- **M3/H5** — viết lại theo `auth_version` trong DB thay vì Redis marker.

**v7** (2026-07-28, vòng review thứ bảy):
- **H8** — bỏ hẳn so sánh theo timestamp (kể cả mili-giây), chuyển sang
  **session epoch** `INCR` nguyên tử. Đồng thời xóa mâu thuẫn nội bộ của v6
  (một chỗ bảo dùng `iat`, chỗ khác bảo không).
- **H7** — thêm mục chống **race** lock/deactivate xen giữa check và mint;
  chốt phương án `auth_version` tăng trong cùng transaction.
- **H3** — CHECK constraint phải là **`V12`** mới; production đã chạy tới
  `V11__trusted_devices.sql` và bảng `users` đã có dữ liệu thật, nên cần
  `NOT VALID` → sửa dữ liệu → `VALIDATE`, kèm test nâng cấp V11→V12.
- **C1** — bỏ nốt phần check-runs/`checks: read` còn sót ở đầu mục (mâu thuẫn
  với quyết định Workflow Runs API bên dưới); thêm `run_attempt`; chốt cách
  enforce CodeQL triage (`security-events: read` nếu tự động).
- **M5 (mới)** — chưa có bằng chứng production chạy SHA nào.
- **Thứ tự** — sửa thành **H8 → H7 → H5** cho khớp với chính nội dung H8.

**v6** (2026-07-28, sau vòng review thứ sáu):
- **H8** — loại bỏ đề xuất "xóa revocation key khi mint" của v5: nó làm token
  cũ sống lại và giết sạch sign-out-all. Thay bằng claim
  `session_issued_at_ms` + `revokedBefore` mốc milliseconds.
- **C1** — loại bỏ quy tắc "skipped là đạt" của v5 (fail-open); chốt luật
  theo từng job; bỏ hẳn check-runs, chỉ dùng Workflow Runs API.
- **H7** — policy phải là predicate trên `User`, không đặt trong
  `activeAdmin(email)`, vì `refresh()` không đi qua đường đó.
- **H2** — quy định độ mạnh `OTP_PEPPER` (≥32 byte, secret riêng) và test
  đúng key Redis thay vì quét regex.
- **H3** — ma trận constraint nêu rõ `ext_subject` ở cả 6 ca.

**v5** bổ sung sau vòng review thứ năm:
- **H7 (mới, nâng từ M3)** — deactivate club bị vượt qua bằng đăng nhập OTP
  mới. Đây là bypass an ninh thật, không phải hardening.
- **H8 (mới)** — revocation kiểu boolean chặn nhầm JWT mới cấp; phải fix
  trước khi H5 (sign-out-all) và H7 (reactivate) lên production.
- **H5** — sửa cách diễn đạt sai ở v4: allowlist theo method+path, cấm
  wildcard `/api/auth/**` (sẽ giết `GET/PATCH /api/auth/me`).
- **H4** — thêm yêu cầu sửa `GlobalExceptionHandler`, nếu không "ném tiếp"
  vẫn bị nuốt thành 409.
- **H3** — thêm Testcontainers test cho chính CHECK constraint.
- **H2** — thêm HMAC + pepper cho OTP (đang lưu plaintext trong Redis).
- **C1** — "CI"/"CodeQL" là workflow name chứ không phải check-run name;
  chốt cơ chế `ci-gate`/`codeql-gate` + quyền `actions: read`.

**Gate nghiệm thu cuối cho cả đợt fix:** `mvn -B -pl monolith -am clean verify`
+ ShellCheck (scripts), Actionlint (workflows), migration integration tests,
GitNexus `detect_changes` trước mỗi commit. Mỗi mục code một commit, TDD RED
trước. Riêng C1 là cấu hình GitHub ngoài Git — không áp quy tắc commit.

## Critical

- [x] ✅ **C1. Cổng deploy** — **XONG 2026-07-28**. Trước đó push lên `main` là
      deploy thẳng, song song với CI (verify bằng `gh api`: main "Branch not
      protected", environment `production` `protection_rules: []`, workflow
      không phụ thuộc CI). Trạng thái sau khi fix, đọc lại bằng `gh api`:
      `required_checks: [ci-gate, codeql-gate]`, `enforce_admins: true`,
      `approvals: 1`, `can_admins_bypass: false`, deploy chỉ chạy bằng
      `workflow_dispatch` với SHA 40-hex đúng đỉnh `main`:
  - [x] ✅ **XONG 2026-07-28** — branch protection cho `main`: require PR
        (1 approval, dismiss stale reviews), required status checks
        `ci-gate` + `codeql-gate`, **enforce_admins = true**, cấm force-push và
        xoá nhánh, bắt buộc resolve conversation. `strict` để **false** (không
        bắt nhánh phải up-to-date) — bật lên sẽ buộc rebase lại mỗi lần main
        đổi, chưa cần với quy mô nhóm hiện tại.
    - ⚠️ Hai context này **chỉ tồn tại sau khi `ci.yml`/`codeql.yml` mới vào
      PR**. PR mở từ nhánh chưa có hai job đó sẽ treo vĩnh viễn ở "Expected" —
      rebase nhánh lên `hlow`/`main` mới là hết.
  - [x] ✅ **XONG 2026-07-28** — environment `production`: required reviewer
        `trhlow`, **`can_admins_bypass = false`**, deployment branch policy chỉ
        cho phép **protected branches**.
    - ℹ️ **prevent-self-review để `false` một cách có chủ đích**: repo chỉ có
      **một** admin (`trhlow`; `khugiabao965` và `phdinh254` không phải admin).
      Bật lên là tự khoá — không còn ai approve được deploy. Bật lại ngay khi
      có maintainer thứ hai.
  - [x] ✅ **XONG 2026-07-28** — `.github/workflows/deploy-production.yml`: bỏ
        trigger `push: main`, chỉ còn `workflow_dispatch`, reviewer approve
        trong environment.
  - [x] ✅ **XONG 2026-07-28 — Verify SHA trong workflow** — trước đây nhận mọi ref
        (`feature/foo` cũng lọt vì chỉ check charset, `:33`), fetch thẳng và
        deploy, không kiểm tra thuộc main hay đã qua CI. Phải thêm:
    - Input chỉ nhận SHA 40 ký tự: `^[0-9a-fA-F]{40}$` (bỏ nhận branch/ref
      mutable — không resolve lại branch lúc deploy).
    - Đường deploy thường: yêu cầu **`DEPLOY_SHA == $(git rev-parse
      origin/main)`**, tức đúng đỉnh main.
      `git merge-base --is-ancestor "$DEPLOY_SHA" origin/main` là CHƯA đủ —
      nó nhận mọi commit từng nằm trên main, kể cả commit rất cũ. Gõ nhầm một
      SHA cũ vẫn deploy được binary không khớp schema Flyway hiện tại (nguy
      hiểm thật, vì V12–V14 sắp thêm cột và constraint mới).
    - Rollback về commit cũ là **đường riêng**: workflow/thao tác khác, bắt
      buộc có backup verified, kiểm tra tương thích schema, và một bước xác
      nhận bổ sung — không đi chung cổng deploy thường.
    - Bỏ fallback `${{ inputs.ref || github.sha }}` (`:27`, `:61`) — input
      `ref` phải `required: true`. Còn fallback thì dispatch không nhập gì vẫn
      deploy `github.sha` của branch đang chọn, regex 40-hex thành vô nghĩa.
    - Kiểm CI và CodeQL của **chính SHA đó** đều `success` trước khi SSH sang
      VPS, bằng **Workflow Runs API** (quyết định đã chốt — mọi nhắc tới
      check-runs ở các bản trước đã bỏ). Chi tiết bắt buộc:
      - **Quyền**: workflow hiện chỉ có `permissions: contents: read`
        (`:12-13`) → API trả 403. Thêm đúng `actions: read`. KHÔNG cần
        `checks: read` vì không dùng Check Runs API.
      - ⛔ **"CI" và "CodeQL" là WORKFLOW name, KHÔNG phải check-run name** —
        tìm check-run tên `CI`/`CodeQL` sẽ không bao giờ khớp. Check-run thật
        trên SHA hiện tại của `main` là các job id: `changes`, `backend`,
        `dependency-review`, `frontend` (ci.yml) và `analyze-java`,
        `analyze-frontend` (codeql.yml).
      - Tệ hơn: `backend`/`frontend` có `if: needs.changes.outputs.* == 'true'`
        (`ci.yml:33`, `:105`) nên **skipped** khi path filter không khớp, còn
        `dependency-review` có `if: github.event_name == 'pull_request'`
        (`:97`) nên **không tồn tại** trên SHA của push. Require thẳng mấy
        context này ở branch protection sẽ kẹt PR vĩnh viễn.
      - Chốt MỘT cơ chế cho mỗi mục đích, không trộn:
        - **Deploy gate**: Workflow Runs API theo *file/ID* `ci.yml` và
          `codeql.yml` (bền vững trước đổi tên), quyền `actions: read`.
        - **Branch protection**: thêm job tổng hợp `ci-gate` / `codeql-gate`
          (`needs:` mọi job, `if: always()`) — job này LUÔN chạy nên dùng làm
          required status check được. Require đúng hai context đó.
      - ⛔ **KHÔNG dùng quy tắc chung "skipped là đạt"** (đề xuất v5 SAI, đã
        loại) — như vậy là fail-open: một job bị skip vì lý do ngoài dự kiến
        sẽ lặng lẽ được tính là pass. `ci-gate` phải xét theo **từng job**,
        có tính tới event và output của `changes`:
        - `changes`: bắt buộc `success`, không bao giờ được skipped.
        - `backend`: `success`, HOẶC skipped **chỉ khi**
          `needs.changes.outputs.backend == 'false'`.
        - `frontend`: `success`, HOẶC skipped **chỉ khi**
          `needs.changes.outputs.frontend == 'false'`.
        - `dependency-review`: trên `pull_request` bắt buộc `success`; trên
          `push` được phép không tồn tại.
        - `codeql-gate`: cả `analyze-java` và `analyze-frontend` phải
          `success` — không job nào được skipped.
      - Thống nhất **một API duy nhất là Workflow Runs API**.
      - ⛔ **Thứ tự các bước là bắt buộc** — lọc `conclusion == success` TRƯỚC
        rồi mới chọn latest là fail-open: một run success cũ sẽ che mất run
        fail mới hơn của cùng SHA. Đúng thứ tự:
        1. Lấy **mọi** run khớp workflow file/ID + `head_sha` + `head_branch`
           = `main` + `event` = `push` (có phân trang).
        2. Chọn run **mới nhất** theo `run_number` / `created_at`.
        3. Lấy trạng thái attempt hiện hành của **chính run đó**.
        4. Chỉ đến bước này mới yêu cầu `status == "completed"` **và**
           `conclusion == "success"`.
      - `run_attempt` chỉ có nghĩa **bên trong một run ID**; không dùng nó để
        so hai run ID độc lập với nhau.
      - `cancelled` / `neutral` / `timed_out` **không** tính là đạt; không tìm
        thấy run nào cũng là fail (fail-closed, không "không thấy nghĩa là
        ổn").
    - Deploy đúng SHA đã verify.
  - [x] ✅ **XONG 2026-07-28 — CodeQL triage gate**: gate là "không còn alert
        High/Critical chưa triage", KHÔNG phải "workflow CodeQL xanh".
    - **Chốt cách enforce: cổng TỰ ĐỘNG trong workflow deploy** (không phải
      bước thủ công) — bước `Require no open High/Critical code scanning
      alerts` dùng code-scanning alerts API với quyền `security-events: read`,
      fail khi còn alert `open` mức high/critical và in ra số hiệu + đường dẫn.
      Dismiss kèm lý do vẫn là đường thoát hợp lệ vì alert hết `open`.
    - **Alert #5 `js/xss-through-dom` đã FIX** (không dismiss): đường taint là
      thật — ô "Banner minh hoạ (URL)" trong `EventForm` là text tự do →
      `formData.bannerUrl` → `<EventBanner src>` → `<img src>`. Thêm
      `utils/safeImageUrl.ts` chỉ cho `http(s)` + đường dẫn same-site, chuẩn
      hoá scheme trước khi so (trình duyệt bỏ qua whitespace/ký tự điều khiển
      nên `java<TAB>script:` vẫn chạy). Chặn thêm sink thứ hai cùng loại ở
      `LandingPage.tsx:465` mà CodeQL chưa flag.
    - ⚠️ Alert **chỉ đóng sau khi fix vào `main`** và CodeQL chạy lại trên
      `main`; tới lúc đó cổng deploy vẫn fail-closed (đúng thiết kế).
  - Tự động hóa sau khi quy trình ổn định. Khi đó nếu dùng `workflow_run`,
    bắt buộc đủ 4 guard (thiếu 1 là cổng hổng):
    `if: github.event.workflow_run.conclusion == 'success'`; checkout
    `github.event.workflow_run.head_sha` (KHÔNG dùng `github.sha`); lọc
    `head_branch == 'main'`; và nhớ `workflows: [CI, CodeQL]` là OR —
    workflow chạy khi MỘT trong hai xong, không phải chờ cả hai.

- [x] ✅ **C2. Dữ liệu ảo NẰM TRONG artifact production, không chỉ sau một cờ**
      — **XONG 2026-07-28**. Đo lại trên bundle dựng tại máy sau khi fix:
      **0 chunk `mock*`** (trước: 3) và **2 email duy nhất** trong toàn bộ
      `dist/assets/*.js` (trước: 17), cả hai đều là nội dung UI thật —
      `support@tvu.edu.vn` ở footer và `organizer@tvu.edu.vn` là placeholder
      form. **Địa chỉ Gmail cá nhân đã biến mất khỏi bundle.**
      - Cách làm: **xoá hẳn nhánh demo** khỏi 7 service (bỏ `withXFallback`,
        `list()`/`getById()`/`save()` sync và `buildMock*` — typecheck xác nhận
        **không caller nào** ngoài services dùng chúng), chuyển 6 file fixture
        sang `src/test/fixtures/`, gỡ `apiConfig.useDemoData` và
        `DemoDataBadge`. Fixture không còn trong đồ thị runtime **vì không ai
        import**, không phải vì khéo cấu hình build.
      - Hiệu ứng phụ: **10 test frontend fail sẵn đã hết** (94/94 pass) — chúng
        fail vì `mockEvents`/`mockTickets` chạm `localStorage` lúc import
        top-level, đúng gốc rễ mà C2 gỡ.
      - Gate: `npm run build:production` → `scripts/verify-bundle.mjs`, chạy
        trong CI **và** trong `frontend/Dockerfile` nên image triển khai cũng
        bị chặn. Denylist **sinh tự động từ chính file fixture** (29 term) chứ
        không hardcode.
      - Gate đã bắt được một ca thật ngay lần chạy đầu: placeholder
        `StudentProfileForm.tsx` dùng `110121001`, trùng đúng một MSSV fixture
        → đổi sang dạng che `110121xxx` (một MSSV đầy đủ trong placeholder
        cũng có thể trùng sinh viên thật).
      - `.env.production` giữ biến bất biến (`VITE_APP_ENV`,
        `VITE_AUTH_PROVIDER`); đã **gỡ khai báo trùng** ở `ci.yml`,
        `compose.yaml` và `frontend/Dockerfile` để ba nơi không thể lệch nhau.
      - Backend theo **phương án (a)**: profile Maven `prod` loại
        `application-dev.yml` khỏi JAR. Verify hai chiều bằng `unzip -l`:
        có `-Pprod` → không còn file; không có → dev vẫn đủ. ⚠️ **Phải
        `clean`**: lần chạy đầu vẫn thấy file vì `target/classes` còn bản cũ.
      - Nội dung gốc của mục này giữ lại bên dưới làm bằng chứng đối chiếu:
      — ℹ️ *Ghi chú phân loại (v15)*: xét thuần tác động bảo mật/privacy thì
      đây là **High**, không phải Critical (rò rỉ fixture + một email cá nhân
      thật, không phải lỗ hổng chiếm quyền). Vẫn **giữ ở Critical** vì nó là
      **release blocker theo yêu cầu nghiệm thu**: bản production phải sạch dữ
      liệu giả. Ghi rõ để không ai hạ mức rồi cho qua gate.
      — kiểm chứng trên bundle dựng tại máy (`frontend/dist` **bị
      `.gitignore`**, không phải artifact có sẵn trong repo). Lệnh tái hiện,
      ghi kèm SHA đang kiểm:
  ```
  git rev-parse HEAD                       # ghi lại SHA
  cd frontend && npm ci                    # Node: cùng major với Dockerfile
  npm run build:production                 # xem ghi chú ngay dưới
  ls dist/assets | grep -i mock
  grep -rhoE "[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}" dist/assets/*.js | sort -u
  ```
  - [ ] ⚠️ Chỉ truyền `VITE_USE_DEMO_DATA=false` là **không dựng đúng artifact
        production** — còn thiếu các biến khác mà `ci.yml:112-113` và
        `compose.yaml:38-39` đặt. Phải tạo **một script/target build
        production duy nhất** (ví dụ `npm run build:production`) dùng chung
        cho CI, Compose và kiểm tra thủ công, để ba nơi không thể lệch nhau.
        Trước khi có script đó thì phải liệt kê đầy đủ biến giống
        `ci.yml`/`compose.yaml`, không dùng lệnh rút gọn.
  - Kết quả đo trên `hlow` (`31622c33`): 3 chunk fixture riêng
    `mockClubs-CKIiTdil.js`, `mockEvents-CQzUOhRa.js`,
    `mockTickets-xv_668WE.js`; hash tên file sẽ đổi theo nội dung nên đừng
    dựa vào hash khi kiểm lại.
  - `dist/assets/userService-*.js` chứa **14 email fixture**; tổng trên toàn
    bộ `dist/assets/*.js` là **17 email duy nhất**. Trong đó có **một địa chỉ
    Gmail cá nhân thật** — cố ý KHÔNG ghi nguyên văn vào tài liệu này vì repo
    có thể public; tra bằng lệnh grep ở trên. Còn lại là email
    `*.student@tvu.edu.vn` và các mã dạng MSSV.
  - Nguyên nhân: 9 lời gọi `import ... from "../data/mock*"` nằm ở **top-level
    module** của service (`auditLogService.ts:1`, `clubService.ts:1`,
    `clubStatsService.ts:1-3`, `eventService.ts:1`, `registrationService.ts:1`,
    `ticketService.ts:1`, `userService.ts:1`). `useDemoData` là thuộc tính đọc
    lúc chạy chứ không phải hằng số fold được, nên tree-shaking không cắt
    được — dựng với `VITE_USE_DEMO_DATA=false` vẫn ship đủ fixture.
  - [ ] Vì vậy kết luận "production không phục vụ dữ liệu ảo" chỉ đúng theo
        nghĩa hẹp là **cờ đang tắt**. Dữ liệu vẫn được tải về máy người dùng
        và vẫn đọc được. (Chính xác hơn: biến Vite là **build-time**, người
        dùng KHÔNG tự bật lại cờ trong bundle đã dựng được — rủi ro là lộ dữ
        liệu, không phải bị bật lại từ phía client.) Phải **gỡ khỏi đồ thị
        phụ thuộc runtime**: xóa import top-level, chuyển fixture sang thư mục
        test.
  - [ ] Nghiệm thu bằng chứng cứ, không bằng cờ — nhưng tiêu chí "không còn
        chuỗi dạng email" là **quá rộng**, sẽ bắt nhầm email liên hệ,
        placeholder và nội dung hợp lệ. Gate đúng gồm 4 phần:
    - Không còn **runtime import** nào từ `src/data/mock*` (kiểm ở source, và
      không còn chunk `mock*` trong `dist/assets`).
    - **Denylist**: các email fixture đã biết, domain fixture, dải MSSV mẫu.
    - ⚠️ **3 storage key mock phải xử lý theo hai giai đoạn**, không đưa thẳng
      vào denylist — C3 yêu cầu bundle mới CHỨA đúng ba chuỗi đó để gọi
      `removeItem()`, nên nếu cấm luôn thì release dọn dẹp đầu tiên không bao
      giờ qua được gate:
      - **Giai đoạn 1 (release cleanup)**: cho phép ba key xuất hiện **duy
        nhất trong module cleanup**; vẫn cấm mọi fixture và mọi import mock.
      - **Giai đoạn 2 (sau thời gian giữ tương thích)**: xóa module cleanup,
        lúc đó mới yêu cầu ba key biến mất hoàn toàn khỏi bundle.
    - **Allowlist**: email hợp lệ được phép tồn tại (ví dụ địa chỉ hỗ trợ).
    - Build bằng **toàn bộ biến production** giống CI/Compose, không chỉ
      `VITE_USE_DEMO_DATA=false`.
  - [ ] **Backend artifact cũng chứa cấu hình demo** — JAR dùng cho Docker
        đóng gói cả `application-dev.yml` (`src/main/resources/`, có
        `bootstrap-admin.email` mặc định và khối `demo-otp` ở `:24-29`), cùng
        `DemoOtpProperties.class` và `FixedOtpCodeIssuer.class` (đều nằm ở
        `src/main/java`).
    - Chúng **không hoạt động** dưới profile `prod` (`@Profile({"dev","test"})`
      + `ProductionSecretsValidator` chặn) → chưa phải bypass, không nâng mức
      nghiêm trọng.
    - ⛔ **Không loại hai class demo bằng Maven profile** —
      `ProductionSecretsValidator.java:6,32` **import và nhận thẳng**
      `DemoOtpProperties` trong constructor, nên loại class khỏi compilation
      sẽ làm build lỗi. Chọn một trong hai:
      - **(a, đơn giản)** Chỉ loại `application-dev.yml` khỏi JAR production;
        giữ hai class, tiếp tục dựa vào `@Profile` + validator như hiện tại.
      - **(b, triệt để)** Nếu bắt buộc artifact không chứa class dev: chuyển
        toàn bộ OTP dev sang source set/module riêng, và bỏ phụ thuộc
        compile-time của validator vào `DemoOtpProperties` (đọc qua
        `Environment` hoặc interface trung gian).
    - Fixture trong `src/test` **giữ nguyên** — không nằm trong artifact chạy.
  - [ ] ⚠️ **Địa chỉ cá nhân đã nằm trong lịch sử Git** — không chỉ ở bundle:
        địa chỉ Gmail cá nhân nói trên xuất hiện từ commit **`48c7ee6`**
        (`style(frontend): align UI with SVG design system...`) — tra bằng
        `git log -S` với chuỗi lấy từ bundle, KHÔNG ghi nguyên văn ở đây. Xóa
        ở commit mới KHÔNG xóa khỏi lịch sử.
    - Nếu chủ sở hữu địa chỉ không đồng ý công khai: cần kế hoạch **history
      rewrite riêng** (`git filter-repo`), phối hợp force-push và thông báo
      cho mọi người đang clone.
    - Đây là thao tác phá lịch sử → **tách hẳn thành việc riêng**, không trộn
      vào đợt fix code này.
  - Chi tiết + bảng đối chiếu service ↔ endpoint:
    `docs/MOCK_DATA_REMOVAL_SURVEY_VI.md`.

- [ ] **C3. Chưa có quy trình làm sạch production (clean slate)** — cả v8
      không có mục nào cho reset DB/Redis/RabbitMQ/bootstrap/localStorage.

  > ✅ **THIẾT KẾ XONG 2026-07-28 — THỰC THI VẪN CHƯA.** Quy trình đã viết
  > thành runbook riêng: **`backend/docs/CLEAN_SLATE_CUTOVER_VI.md`** (blue-green,
  > định nghĩa no-write, commit point, rollback đồng bộ cả bốn, giữ volume cũ).
  > Ba thứ giao kèm, đều đã chạy/verify được:
  > 1. **`scripts/clean-slate-inventory.sh`** — bản đếm bằng chứng: 9 bảng,
  >    `outbox_messages` theo status, **mọi** queue kể cả DLQ (dùng
  >    `rabbitmqctl list_queues`, không hardcode tên), và prefix Redis lấy
  >    **thẳng từ source Java**. ⚠️ Bản nháp đầu tôi đoán `ticket:count:*`
  >    trong khi prefix thật là `ticket:remaining:` — sai prefix thì đếm ra 0
  >    và trông y hệt "không có dữ liệu". Đã sửa.
  > 2. **`frontend/src/lib/legacyStorageCleanup.ts`** — xoá 3 storage key, chạy
  >    ở `main.tsx` trước khi render. 6 test. Chạy **mỗi lần khởi động** thay vì
  >    một lần có marker: marker phải ghi thêm một key vĩnh viễn vào máy mọi
  >    người dùng chỉ để tiết kiệm 3 lời gọi `removeItem`, và idempotent còn tự
  >    lành nếu một tab cũ ghi lại key.
  > 3. Nhánh miễn trừ trong `verify-bundle.mjs` giờ **thật sự được dùng** —
  >    giai đoạn 1 cho phép 3 key xuất hiện đúng trong module cleanup.
  >
  > ⬜ **Còn nợ trước khi thực thi**: chạy `clean-slate-inventory.sh` trên
  > production và lưu kết quả; H13 + H14 phải xong trước cutover.

  ### ⛔ C3.-1 — SƠ ĐỒ MIGRATION CHỐT CỨNG (v15, thay mọi mô tả rải rác trước)

  Đến v14/nháp v15 sơ đồ migration bị mô tả ở bốn chỗ và **không khớp nhau**:
  C3 ghi "V1→V13", H8 lại cần thêm migration lineage nên nói tới V14, M8 muốn
  gộp constraint role vào V13 nhưng thứ tự thi công lại đặt M8 **sau** H3.
  Chốt một lần, mọi mục khác phải trỏ về đây:

  | File | Nội dung | Thuộc mục |
  |---|---|---|
  | `V12__users_auth_version.sql` | `users.auth_version` | H8 |
  | `V13__users_auth_identity_constraint.sql` | **Toàn bộ** invariant identity + role/profile: CHECK auth_method↔role↔`ext_subject` (H3) **và** CHECK organizer-phải-có-club, sinh viên/admin-không-club, `VERIFIED`⇒`mssv NOT NULL`, organizer/admin-không-`mssv`/`class_code` (M8) | H3 **+ M8, gộp làm một** |
  | `V14__trusted_device_lineage.sql` | `trusted_devices.device_family_id`, `trusted_devices.issued_auth_version` | H8 (phần lineage) + M1 |

  - [ ] ⛔ **M8 phải làm CÙNG LÚC với H3, không phải sau.** Gộp constraint vào
        cùng một migration thì chỉ preflight dữ liệu cũ **một lần**; tách ra
        thì phải preflight hai lần và có nguy cơ V13 pass rồi migration M8 sau
        đó fail giữa chừng trên production. Thứ tự thi công ở cuối file đã sửa
        theo đây.
  | `V15__notification_delivery_ledger.sql` | Bảng delivery ledger, `message_id` UNIQUE | **H13.1, CHỈ nếu chốt phương án (B)** |

  - [ ] Thứ tự thi công bắt buộc: **V12 → V13 → V14 → V15**. Không đổi số,
        không chèn thêm — Flyway out-of-order sẽ chặn khởi động.
  - [ ] ⚠️ **V15 là có điều kiện**: chỉ tồn tại nếu H13.1 chốt phương án (B)
        (chuyển delivery ledger sang PostgreSQL). Nếu chốt (A) thì bỏ V15 và
        dừng ở V14. Ghi quyết định H13.1 **trước** khi bắt đầu bất kỳ migration
        nào, để không phải chèn số về sau.
  - [ ] Trong mọi runbook/script, ghi **"Flyway migrate tới latest"**, TUYỆT
        ĐỐI không hardcode "V13" hay "V14": lần sau thêm migration là runbook
        sai ngay mà không ai nhận ra.

  ### ⛔ C3.0 — QUYẾT ĐỊNH BẮT BUỘC CHỐT BẰNG VĂN BẢN TRƯỚC MỌI VIỆC KHÁC

  Đến v14 checklist **tự mâu thuẫn** về số phận dữ liệu production và người
  triển khai buộc phải tự suy đoán một thao tác **xóa dữ liệu không hoàn tác
  được**:
  - C3 giả định dựng DB v2 **rỗng** rồi migrate tới latest từ đầu.
  - H3 lại khẳng định V13 chạy trên bảng `users` **đã có dữ liệu người dùng
    thật** và phải sửa dữ liệu cũ trước khi áp CHECK constraint.
  - Bảng LOẠI (dòng V10) cũng dựa trên giả định "DB trống".

  Chỉ một trong hai được đúng. Chọn và ghi tên người quyết định + ngày vào
  ngay dưới đây trước khi viết dòng code nào của C3/H3:

  - [x] ✅ **ĐÃ CHỌN — Phương án 1 — Clean slate** (mặc định nếu production mới chỉ có dữ
        liệu thử nghiệm): **không migrate dữ liệu nào sang stack v2** — dựng
        volume mới rỗng, chỉ bootstrap danh sách admin thật đã được duyệt.
        Hệ quả: H3 KHÔNG cần bước sửa dữ liệu cũ, V13 áp thẳng vào DB rỗng;
        bảng LOẠI (V10) giữ nguyên.
    - ⛔ **KHÔNG "xoá toàn bộ volume cũ"** (cách diễn đạt sai ở bản nháp v15).
      Câu đó phá chính đường rollback mà mục "Rollback (chỉ trong giai đoạn A)"
      bên dưới yêu cầu, và phá luôn trước khi cutover. Cách nói đúng:
      **`stop` stack cũ và GIỮ NGUYÊN volume cũ cho tới hết thời gian
      retention rollback**; xoá là bước cuối cùng, sau cùng, theo mục "Chỉ xóa
      stack/volume cũ sau khi hết thời gian lưu giữ rollback".
    - [ ] Bằng chứng "không có dữ liệu thật cần giữ" phải phủ **toàn bộ state**,
      không chỉ ba bảng. Đếm và lưu kết quả kèm ngày giờ cho:
      - PostgreSQL (tên bảng đúng theo migration, đã đối chiếu — **`ticket_inventories`
        và `outbox_messages` ở dạng SỐ NHIỀU**, `V3:1` và `V3:37`; bản nháp v15
        ghi sai thành `ticket_inventory`/`outbox_message`, chép nguyên vào
        truy vấn kiểm kê sẽ lỗi hoặc bỏ sót bằng chứng):
        `users`, `clubs`, `events`, `reservations`, `tickets`,
        `ticket_inventories`, `audit_log`, `outbox_messages`, `trusted_devices`.
      - RabbitMQ: độ sâu **mọi** queue, kể cả retry queue và **DLQ**.
      - Redis: các key còn ý nghĩa nghiệp vụ (OTP đang chờ, counter tồn kho,
        idempotency marker) — nêu rõ key nào chấp nhận mất.
      - Storage/attachment nếu sau này có thêm (hiện chưa có — ghi "N/A" chứ
        đừng bỏ trống).
      - ⚠️ Chỉ đếm `users`/`reservations`/`tickets` là **chưa đủ**: một CLB hay
        một sự kiện thật đã được nhập tay vẫn là dữ liệu cần giữ, và message
        tồn trong DLQ vẫn có thể gửi email thật sau cutover.
  - [ ] **Phương án 2 — Data migration**: giữ dữ liệu thật. Bắt buộc thêm
        inventory (đếm theo `role`/`auth_method`/`ext_subject IS NULL`),
        preflight script phát hiện mọi row vi phạm CHECK sắp thêm, bước sửa dữ
        liệu có kiểm soát + backup verified trước, và rehearsal trên bản sao
        production. H3/V13 phải viết theo hướng "sửa dữ liệu rồi mới thêm
        constraint", KHÔNG phải "DB trống".
  - [x] Ghi quyết định: **`Chốt: Phương án 1 — Clean slate — người quyết định:
        Trần Hoàng Long — ngày: 2026-07-28`**
    - Hệ quả đã khoá theo quyết định này: **H3/V13 áp CHECK constraint thẳng
      vào DB rỗng**, không có bước sửa dữ liệu cũ. **V14 (H8 pha 2 + M1) KHÔNG
      cần backfill `device_family_id` / revoke device cũ** — bảng
      `trusted_devices` trống ở stack v2. Bảng LOẠI (dòng V10) giữ nguyên.
    - [ ] Vẫn còn nợ **bằng chứng "không có dữ liệu thật cần giữ"**: bản đếm
      9 bảng PostgreSQL + độ sâu mọi queue (kể cả DLQ) + key Redis nghiệp vụ,
      có ngày giờ. Clean slate **chưa được thực thi** khi chưa có bản đếm này.
    - [ ] Nhắc lại ràng buộc: **`stop` stack cũ và GIỮ volume cũ** tới hết
      retention rollback; không xoá volume ở bước này.
  - ~~Đến khi ô trên chưa điền, C3 và H3 bị coi là chặn lẫn nhau~~ → **đã gỡ
    chặn 2026-07-28**, H3 được phép bắt đầu.

      Xóa theo tên hay theo email là sai hướng: sẽ sót FK chuỗi
      `tickets → reservations → events → users/clubs`, và message cũ còn nằm
      trong queue/DLQ vẫn gửi email hoặc xử lý dữ liệu đã xóa. Làm mới hoàn
      toàn thì đúng thứ tự này:
  ⚠️ Cấu hình hiện tại **sẽ tái dùng dữ liệu cũ** nếu chỉ "chạy lại":
  `compose.yaml:1` cố định `name: tvu-event-ticket`, volume đặt tên cố định
  (`postgres_data`, `redis_data`, `rabbitmq_data`, `:156-160`), RabbitMQ dùng
  vhost mặc định `/`. Vì vậy phải dựng **stack v2 song song**, theo đúng thứ
  tự sau:
  - [ ] Dựng stack v2 với **project name riêng** (`name: tvu-event-ticket-v2`
        hoặc `docker compose -p`) và **volume riêng** — không dùng lại tên
        volume cũ.
  - [ ] ⛔ **Xử lý xung đột cổng trước đã** — `compose.yaml:10-11` bind
        `80:80` và `443:443`, nên bản sao y nguyên cho v2 sẽ **không khởi động
        được** khi Caddy cũ đang chạy; hai Caddy cũng không được cùng xin
        certificate cho một domain (ACME rate limit + tranh chấp). Chọn một
        kiến trúc:
    - **(a, khuyến nghị)** Tách **một edge Caddy duy nhất** chạy ngoài hai app
      stack, giữ nguyên qua cả cutover. Cutover = đổi upstream trong Caddyfile
      rồi `reload`, không restart edge, không đụng chứng chỉ.
      ⛔ **Cảnh báo trộn traffic**: Caddyfile hiện trỏ upstream bằng tên trần
      `monolith:8080` (`:20,28,34`) và `frontend:80` (`:38`); Compose tự đăng
      ký alias theo tên service, nên nếu v1 và v2 cùng nối một external
      network thì Docker DNS có thể trả container của **cả hai** — request
      production rơi ngẫu nhiên sang stack chưa nghiệm thu.
      **Alias duy nhất là BẮT BUỘC**, không phải một lựa chọn ngang hàng:
      - Đặt tên/alias **duy nhất**: `frontend-v1`/`monolith-v1` và
        `frontend-v2`/`monolith-v2`, Caddyfile trỏ tường minh, cutover là đổi
        `-v1` → `-v2`.
      - ⛔ "Hai external network riêng" **một mình không đủ**: nếu edge Caddy
        tham gia cả hai network và mỗi bên đều có alias `monolith`/`frontend`,
        hostname trần vẫn resolve được sang cả hai. Hai network chỉ an toàn
        khi (i) vẫn dùng alias duy nhất, hoặc (ii) edge chỉ nối **một**
        network tại một thời điểm và cutover bằng attach/detach network.
    - **(b)** Giữ hai Caddy nhưng có Compose override **bỏ hẳn public ports**
      ở v2, chỉ publish trên `127.0.0.1` với cổng tạm cho tới lúc cutover.
    - Smoke test v2 đi qua cổng/network tạm đó, không qua domain thật.
  - [ ] RabbitMQ: volume mới **hoặc** vhost mới, kèm cấp quyền cho user và
        cập nhật biến cấu hình tương ứng ở monolith.
  - [ ] **Dừng hẳn monolith + workers cũ TRƯỚC khi backup lần cuối** — "giữ
        read-only" không chặn được monolith, outbox relay và Rabbit listener
        tiếp tục ghi DB và phát message.
    - Đính chính câu chữ của bản trước: `pg_dump` **vẫn cho snapshot nhất
      quán** kể cả khi DB đang nhận ghi (MVCC). Vấn đề thật không phải "backup
      hỏng" mà là **RPO**: mọi transaction phát sinh sau thời điểm snapshot sẽ
      không có trong bản backup, nên cutover dựa vào nó sẽ mất phần dữ liệu
      đó. Dừng writer là để đạt RPO = 0.
  - [ ] Backup PostgreSQL **và restore thử thành công** (backup chưa restore
        được thì chưa phải backup).
  - [ ] **KHÔNG purge RabbitMQ cũ** — giữ nguyên để còn đường rollback; stack
        v2 dùng vhost/volume mới nên message cũ không chạm tới được.
  - [ ] ⛔ **Nội dung DB của v2 phụ thuộc C3.0** — bước này TRƯỚC ĐÂY giả định
        vô điều kiện "DB rỗng", mâu thuẫn với Phương án 2:
    - **Phương án 1 (Clean slate)**: DB v2 **rỗng**, chạy Flyway migrate tới
      latest.
    - **Phương án 2 (Data migration)**: DB v2 khởi tạo bằng **restore dữ liệu
      production**, chạy preflight sửa row vi phạm CHECK, rồi migrate tới
      latest. KHÔNG dựng rỗng.
  - [ ] Chạy **Flyway migrate tới latest** (xem C3.-1 — KHÔNG hardcode số
        phiên bản; chuỗi hiện tại là **V1→V14**, hoặc **V1→V15 nếu H13.1 chốt
        phương án B**).
  - [ ] Bootstrap đúng danh sách email quản trị thật đã duyệt (xem H6).
  - [ ] **Smoke test đầy đủ trên stack v2** trước khi đụng Caddy/DNS.
  - [ ] Cutover: đổi upstream của edge Caddy sang v2 và `reload` cấu hình
        (kiến trúc a), hoặc gỡ override cổng tạm rồi hạ Caddy cũ (kiến trúc
        b). Stack cũ chuyển sang trạng thái **stopped**, không phải
        "read-only".
  - [ ] ⛔ **Định nghĩa "commit point" — thiếu cái này thì rollback ăn mất dữ
        liệu thật.** Sau khi đổi edge sang v2, nếu người dùng đã đăng ký/nhận
        vé trên v2 thì rollback về PostgreSQL/RabbitMQ cũ sẽ **xóa sạch mọi
        giao dịch mới**. Chia thành hai giai đoạn rõ ràng:
    - **Giai đoạn A — sau cutover, v2 ở chế độ maintenance**: chạy smoke công
      khai trên `evts.id.vn` (OTP thật tới từng bootstrap mailbox, Microsoft
      login, kiểm tra queue và mail đi). Lỗi ở giai đoạn này → rollback toàn
      bộ stack cũ, an toàn vì chưa có ghi nghiệp vụ của người dùng thật.
      ⚠️ **"No-write" phải định nghĩa chính xác, nếu không sẽ tự mâu thuẫn**:
      chính các test trên đều ghi DB (verify OTP ghi trusted device, Microsoft
      login `save(user)`, bootstrap, outbox/queue). Nghĩa đúng là:
      - Chặn **ghi nghiệp vụ từ người dùng công cộng** (đăng ký sự kiện, cấp
        vé, check-in).
      - Cho phép operator/tài khoản test đi qua: IP allowlist, VPN hoặc mTLS.
      - ⛔ **"Header tạm thời" là bypass giả** nếu viết ngây thơ: header đến từ
        client, nên bất kỳ ai đoán/đọc được tên + giá trị header đều vượt được
        maintenance — tức là mở ghi cho toàn bộ Internet đúng lúc đang định
        đóng. Thứ tự ưu tiên: **IP allowlist / VPN / mTLS trước**. Nếu bắt buộc
        dùng header thì Caddy phải `header_up -X-Maintenance-Bypass` (xoá
        header do client gửi) **rồi mới** tự chèn lại sau một lớp xác thực
        riêng (basic auth / mTLS ở edge), không bao giờ tin header nguyên bản.
      - Test bắt buộc: gửi request kèm header bypass từ IP ngoài allowlist →
        phải bị chặn.
      - Chấp nhận các bản ghi test sẽ bị bỏ nếu rollback — chỉ dùng tài khoản
        test, không dùng dữ liệu thật.
      - Không có cơ chế bypass thì hoặc không test được auth thật, hoặc lỡ mở
        ghi cho toàn bộ người dùng — cả hai đều hỏng.
    - **Giai đoạn B — mở ghi**, chỉ sau khi nghiệm thu giai đoạn A. Đây chính
      là **commit point**.
    - Sau commit point, rollback về DB cũ **không còn an toàn**: phải
      roll-forward (sửa tiến), hoặc có quy trình đồng bộ dữ liệu với một RPO
      đã được chấp nhận và ghi rõ trước.
  - [ ] Rollback (chỉ trong giai đoạn A) = khôi phục **đồng bộ cả bốn**: code
        cũ + PostgreSQL + Redis + RabbitMQ cũ. ⛔ TUYỆT ĐỐI không chạy code cũ
        trên DB **đã migrate tới bất kỳ schema mới nào từ V12 trở lên — hiện
        là V14, hoặc V15 nếu H13.1 chốt phương án (B)** — code cũ không biết
        `auth_version`, không biết lineage trusted-device, và vi phạm CHECK
        constraint mới. (Kiểm bằng `flyway_schema_history`, đừng hardcode một
        số phiên bản cụ thể vào runbook.)
  - [ ] Chỉ xóa stack/volume cũ sau khi hết thời gian lưu giữ rollback.
  - [ ] **Dọn state phía client** — đính chính: FE **không** lưu phiên trong
        `localStorage` (JWT và device token đều là cookie). Thứ thật sự cần
        xóa là 3 key dữ liệu mock:
    - `tvu_event_ticket_events_v1` (`mockEvents.ts:86`)
    - `tvu_event_ticket_reservations_v1` (`mockReservations.ts:156`)
    - `tvu_event_ticket_tickets_v1` (`mockTickets.ts:62`)
    - Hard reload **KHÔNG** xóa `localStorage`. Cần một migration chạy một
      lần ở FE gọi `removeItem()` đúng ba key này (giữ lại kể cả sau khi C2
      xóa file fixture, vì key đã nằm sẵn trên máy người dùng).
    - Cookie cũ: `TVU_AUTH` và `TVU_DEVICE` là **HttpOnly**
      (`AuthCookieService.cookie()`, tham số `httpOnly=true`) nên JavaScript
      **không tự xóa được** — chỉ `XSRF-TOKEN` là JS đụng tới được. Vì vậy khi
      refresh thất bại, phải để **backend** trả `Set-Cookie` với `Max-Age=0`
      cho cả ba (đã có sẵn `AuthCookieService.logoutCookies()`), hoặc FE gọi
      endpoint logout để backend xóa. Đừng viết code FE xóa hai cookie kia —
      sẽ im lặng không làm gì.

## High

- [ ] **H1. Gate OTP end-to-end trước nghiệm thu production** — admin chỉ có
      đường EMAIL_OTP; SMTP sai hoặc mail không đến = không ai đăng nhập
      quản trị được, hiện không có gì phát hiện sớm:
  - [ ] `application-prod.yml:64-66`: bật `management.health.mail.enabled: true`.
        KHÔNG thêm mail vào readiness group (`:49-51` giữ `db,redis,rabbit`).
  - [ ] **Tác động đầy đủ khi mail DOWN** (chấp nhận có chủ đích vì SMTP là
        đường admin duy nhất): overall `/actuator/health` DOWN →
        (a) `smoke-test.sh:38` fail → deploy fail; (b) Docker healthcheck
        (`compose.yaml:89` grep `status":"UP`) đánh dấu container monolith
        **unhealthy liên tục** — compose không có "rotation", traffic vẫn
        chạy, nhưng `docker ps` sẽ báo unhealthy cho tới khi SMTP phục hồi.
  - [ ] Checklist nghiệm thu (PRODUCTION_DEPLOYMENT_VI.md mục 8): sau deploy
        đầu, gửi OTP thật đến **từng** bootstrap mailbox, xác nhận nhận mail
        + đăng nhập thành công rồi mới tuyên bố production ready.
  - [ ] ⛔ **Đính chính v15 — bỏ cách nói "break-glass SQL là phương án cuối".**
        SQL trong `OPERATIONS.md` (dòng 39/47) chỉ sửa được **sai tài khoản /
        sai mailbox** (gõ nhầm email admin, admin nghỉ việc). Nó **không cứu
        được outage SMTP** — vì admin mới tạo bằng SQL vẫn phải nhận OTP qua
        chính SMTP đang chết. Ghi đúng phạm vi:
    - Sai tài khoản/mailbox → dùng SQL của `OPERATIONS.md`.
    - **SMTP/provider chết → SQL vô dụng**, phải dùng cơ chế dự phòng của
      **H14** (SMTP thứ hai đã test, hoặc one-time recovery code phát hành
      ngoài băng). H1 không có đường thoát nào khác.
  - [ ] Vì vậy **H14 là điều kiện tiên quyết để H1 được coi là đóng** — không
        được tuyên bố "đã có break-glass" khi mới chỉ có SQL.
  - ⚠️ **H1 được thi công làm hai nhịp** (để khớp thứ tự ở cuối file, tránh
    hiểu nhầm "H1 ở bước 2 mà điều kiện đóng lại nằm ở bước 4b"):
    - **Bước 2 — phần cấu hình H1**: bật `management.health.mail.enabled`,
      viết checklist nghiệm thu, gửi OTP thật tới từng bootstrap mailbox. Làm
      sớm vì nó phát hiện SMTP hỏng ngay.
    - **Bước 4b — H14**: dựng + **rehearsal thành công** SMTP dự phòng hoặc
      one-time recovery code.
    - **Chỉ sau khi cả hai xong mới được đánh dấu H1 HOÀN TẤT.** Trước đó H1
      luôn ở trạng thái "đã cấu hình, chưa đóng".

- [ ] **H2. OTP verify không nguyên tử** — `OtpStore.java:44-61` GET →
      compare → REMOVE/PUT nhiều lệnh; hai request đồng thời cùng code đúng
      đều OK:
  - [ ] **Ưu tiên Lua script** gộp check code + tăng attempts + consume một
        lệnh. Redis transaction chỉ an toàn nếu WATCH + retry — GET trước
        MULTI vẫn race, nên Lua là phương án chính.
  - [ ] Test: (a) 2 thread cùng code đúng → đúng 1 OK; (b) concurrent wrong
        attempts → đếm attempts đúng, không vượt cap; (c) TTL không bị kéo
        dài qua các lần verify sai.
  - [ ] **Không lưu OTP dạng plaintext** (làm cùng lúc vì Lua script viết lại
        chính chỗ này — tách ra sẽ phải sửa script hai lần):
        `RedisOtpBackend.java:35-37` lưu thẳng `code + ":" + attempts`, ai đọc
        được Redis (dump, `redis-cli`, backup, container cùng host) là lấy
        được OTP admin và đăng nhập trong TTL.
    - Secret riêng `OTP_PEPPER`; lưu `HMAC-SHA256(pepper, code)`.
    - KHÔNG dùng SHA-256 trần: OTP 6 số chỉ có 10^6 khả năng, brute-force
      offline tức thì. Pepper là thứ duy nhất làm dump Redis vô dụng.
    - Lua nhận digest của code người dùng nhập và so digest với digest lưu —
      code gốc không bao giờ vào Redis.
    - Thêm secret vào `generate-env.sh`, preflight (`common.sh`) và
      `ProductionSecretsValidator`. Validator phải kiểm **độ mạnh**, không chỉ
      "khác rỗng": tối thiểu **32 byte ngẫu nhiên** (sinh bằng
      `openssl rand -base64 32`), fail startup ở prod nếu thiếu, là
      placeholder, hoặc ngắn hơn ngưỡng.
    - `OTP_PEPPER` phải là secret **riêng** — không tái dùng JWT private key,
      CSRF secret, QR signing key hay SMTP password.
    - Ghi vào docs: **rotate pepper sẽ vô hiệu hóa mọi OTP đang chờ** (digest
      cũ không còn khớp). Đây là hành vi dự kiến, người dùng chỉ cần xin mã
      mới; nêu rõ để vận hành không tưởng là sự cố.
    - Không log OTP, không log nội dung mail.
    - Test: đọc **đúng key Redis của OTP** và assert giá trị là digest HMAC
      (đúng độ dài, khớp HMAC tính lại từ pepper trong test) và không chứa mã
      gốc. KHÔNG quét toàn bộ Redis bằng regex `\d{6}` — vừa yếu (không chứng
      minh được digest đúng) vừa dễ false-positive vì key khác cũng có thể
      chứa 6 chữ số.

- [ ] **H3. Fail-closed hai lớp cho Entra login** — `resolveUser`
      (`AuthApplicationService.java:92-99`) chỉ match `ext_subject`:
  - [ ] Lớp DB: migration CHECK `SINH_VIEN → MICROSOFT + ext_subject NOT
        NULL`; `ORGANIZER/SUPER_ADMIN → EMAIL_OTP + ext_subject NULL`.
  - [ ] ⛔ **Phải là migration MỚI `V13__users_auth_identity_constraint.sql`**
        — production đã chạy tới `V11__trusted_devices.sql`, sửa V10/V11 sẽ
        gây Flyway checksum mismatch và chặn khởi động. Thêm nữa, đây không
        còn là DB trống như giả định ở bảng LOẠI (mục V10): migration chạy
        trên bảng `users` **đã có dữ liệu thật**.
    - ⛔ **Câu trên chỉ đúng nếu C3.0 chốt Phương án 2.** Nếu chốt Phương án 1
      (clean slate) thì V13 chạy trên DB rỗng và toàn bộ phần "sửa dữ liệu cũ"
      dưới đây bỏ đi. **Không được bắt đầu H3 khi C3.0 chưa điền.**
    - ⚠️ **Đánh số đã chốt, không được đổi**: `V12__users_auth_version.sql`
      thuộc **H8**, `V13__users_auth_identity_constraint.sql` thuộc **H3**.
      Vì thứ tự thi công là H8 trước, nếu H3 vẫn giữ V12 thì H8 buộc phải lấy
      V13 và sau đó thêm V12 vào DB đã chạy V13 — Flyway out-of-order, phải
      bật `outOfOrder=true` hoặc sửa lịch sử, cả hai đều không nên trên
      production.
    - Test nâng cấp phải chạy đủ chuỗi **V11 → V12 → V13**.
    - Preflight dữ liệu hiện có trước khi bật constraint — đếm row vi phạm,
      dừng và báo rõ nếu có, đừng để migration fail giữa chừng.
    - Dùng `ADD CONSTRAINT ... NOT VALID` → kiểm/sửa dữ liệu cũ →
      `VALIDATE CONSTRAINT`, để không khóa bảng lâu và tách được bước sửa dữ
      liệu khỏi bước bật ràng buộc.
    - Test **nâng cấp**: dựng schema tới V11, seed dữ liệu hình dạng giống
      production (bao gồm **trusted device đang active** — xem H8), rồi
      **migrate tới latest** và assert thành công. Test
      INSERT/UPDATE sau migration (mục dưới) chỉ chứng minh constraint hoạt
      động, KHÔNG chứng minh migration chạy được trên DB đang có dữ liệu.
  - [ ] Lớp code: repository `findByExtSubjectAndAuthMethod(subject,
        MICROSOFT)`, sau đó fail-closed nếu `role != SINH_VIEN` (từ chối,
        không mint JWT).
  - [ ] Test: row bất thường (admin có subject) bị từ chối, không mint JWT.
  - [ ] **Testcontainers test riêng cho chính CHECK constraint** (service test
        không chứng minh được DB thật từ chối — M4 chỉ kiểm hành vi dữ liệu
        V9→V10, không kiểm constraint mới có hiệu lực):
    Ma trận phải nêu rõ trạng thái `ext_subject` ở MỌI ca — hai ca invalid
    của v5 bỏ trống cột này nên không chứng minh được constraint đủ chặt:
    - hợp lệ: `SINH_VIEN + MICROSOFT + ext_subject NOT NULL`
    - hợp lệ: `ORGANIZER`/`SUPER_ADMIN` + `EMAIL_OTP` + `ext_subject NULL`
    - từ chối: `SINH_VIEN + MICROSOFT + ext_subject NULL`
    - từ chối: `SINH_VIEN + EMAIL_OTP` + `ext_subject` bất kỳ (cả NULL và
      NOT NULL)
    - từ chối: `ORGANIZER`/`SUPER_ADMIN` + `EMAIL_OTP` + `ext_subject NOT NULL`
    - từ chối: `ORGANIZER`/`SUPER_ADMIN` + `MICROSOFT` + `ext_subject` bất kỳ
    - Kiểm cả **INSERT và UPDATE** (CHECK phải chặn cả đường UPDATE, không chỉ
      lúc tạo row).
  - [ ] Xóa `User.organizer()` / `User.superAdmin()` khỏi `User.java:91-97`
        (5 file test đang dùng → chuyển sang fixture/emailOtp tương đương).

- [ ] **H4. Chốt: CẤM trùng email giữa hai phương thức** (quyết định) —
      email hiện unique ở **ba** chỗ: V1:13 `UNIQUE`, V9
      `ux_users_email_lower`, entity `@Column(unique = true)`; và
      `findByEmail()` trả `Optional` (vỡ nếu có 2 row). Cấm trùng khớp
      schema + mọi luồng hiện có, ít rủi ro nhất:
  - [ ] Entra login bằng email đã thuộc admin → trả **409 có kiểm soát**.
        Phạm vi bắt lỗi phải hẹp:
    - Pre-check email trước để trả 409 cho trường hợp thường.
    - `saveAndFlush()` (hoặc flush có kiểm soát) để race exception nổ trong
      vùng catch, không nổ lúc commit ngoài tầm.
    - CHỈ map vi phạm constraint email (`users_email_key` /
      `ux_users_email_lower`) thành 409 — soi constraint name trong
      exception. `DataIntegrityViolationException` khác (CHECK
      role/auth_method, FK club, NOT NULL...) phải ném tiếp/log như lỗi hệ
      thống, không được nuốt thành 409.
    - Response không chứa email hay tên constraint DB.
  - [ ] ⛔ **Sửa `GlobalExceptionHandler` — nếu không, yêu cầu "ném tiếp" ở
        trên vô nghĩa**: `GlobalExceptionHandler.java:75-80` đang bắt MỌI
        `DataIntegrityViolationException` và trả 409 `DATA_INTEGRITY_CONFLICT`.
        Service ném tiếp thì handler vẫn nuốt, nên CHECK role/auth_method (H3),
        NOT NULL, hay lỗi DB bất ngờ đều bị che thành 409 và không ai thấy.
    - Constraint unique email → 409, message chung (giữ nguyên hành vi).
    - FK nghiệp vụ đã biết (V7: student còn reservation/ticket — chính là ca
      mà comment `:69-73` mô tả) → 409, giữ message hiện tại.
    - CHECK / NOT NULL / constraint không nhận diện được → log ERROR kèm
      constraint name và trả **500**, không phải 409.
  - [ ] Test bằng PostgreSQL Testcontainers (dựng vi phạm constraint thật),
        không mock `DataIntegrityViolationException` — mock không tái hiện
        được cấu trúc `ConstraintViolationException`/SQLState mà code phải đọc.
  - [ ] Sửa test takeover (`login_doesNotClaimAnAdminAccountThatSharesTheEmail`)
        phản ánh hành vi thật: kỳ vọng 409, không phải tạo student mới.
  - Phương án "cho phép trùng" bị loại vì đòi đồng thời: drop
    `users_email_key`, index `(lower(email), auth_method)`, bỏ
    `unique = true` entity, refactor mọi `findByEmail()`, định nghĩa lại
    bootstrap khi email đã tồn tại ở Microsoft account.

- [ ] **H5. Thiết kế lại logout hai tầng** (KHÔNG gọi `revokeAll()` trong
      logout thường — sẽ đăng xuất mọi thiết bị, vô hiệu hóa endpoint
      sign-out-all, và vì `/logout` miễn CSRF
      (`CookieCsrfFilter.java:89-96`) sẽ mở đường logout-CSRF/DoS):
  - [ ] **Logout thường** (`AuthController.java:100-108`): nhận cookie
        `TVU_DEVICE`, revoke qua method MỚI **`revokeActiveInFamily(rawToken)`**
        — KHÔNG tái dùng `exchange()` (token đã revoke sẽ kích hoạt nhánh
        replay → `revokeAll()`, logout lần hai thành đăng xuất mọi thiết bị).
    - ⛔ **Đính chính v15**: bản trước ghi `revokePresentedToken(rawToken)` —
      "revoke đúng row được trình ra". **KHÔNG đủ.** Nếu refresh vừa rotate
      xong, row được trình ra đã là row cũ, còn successor vẫn active → thiết
      bị vẫn đăng nhập sau khi người dùng bấm đăng xuất (ca logout ⟂ refresh,
      xem H8).
    - Hành vi đúng: hash token → tra `device_family_id` → revoke **row active
      hiện hành của family đó**, kể cả khi row đó không phải row vừa trình ra.
    - Vẫn **idempotent**: không tìm thấy family, hoặc family đã không còn row
      active → bỏ qua, không bao giờ gọi `revokeAll`. Cookie thiếu/sai/hết hạn
      vẫn trả 200 và xóa cookies.
    - Phạm vi revoke của mọi đường: xem **bảng chốt duy nhất ở H8**. H5 không
      được định nghĩa lại phạm vi.
    - ⚠️ Phụ thuộc: cần `device_family_id` của `V14__trusted_device_lineage.sql`
      → **H5 làm sau H8**, đúng thứ tự đã ghi ở cuối file.
  - [ ] **Bỏ qua JWT hoàn toàn ở endpoint logout — `permitAll` KHÔNG đủ**
        (sửa kết luận sai ở v3). Cần CẢ HAI:
    - Đưa `/api/auth/logout` vào permitAll (`SecurityConfig.java:37-40` hiện
      chưa có) — điều kiện cần.
    - `bearerTokenResolver()` (`SecurityConfig.java:73-91`) phải trả `null`
      cho `POST /api/auth/logout`. Resolver hiện đọc cookie `TVU_AUTH` cho
      **mọi** request; `BearerTokenAuthenticationFilter` chạy TRƯỚC bước
      authorization, nên khi token hết hạn/sai chữ ký/đã revoke, filter ném
      `AuthenticationException` → entry point trả 401 và chain dừng, request
      không bao giờ tới permitAll hay controller. Logout không cần danh tính
      JWT: nó chỉ revoke device token client tự trình ra + xóa cookie.
    - Sign-out-all là endpoint KHÁC, vẫn resolve JWT như thường: yêu cầu JWT
      hợp lệ + CSRF.
  - [ ] **Cùng gốc lỗi, ngoài logout**: `/api/auth/login`,
        `/api/auth/otp/request`, `/api/auth/otp/verify`,
        `/api/auth/session/refresh` cũng permitAll nhưng vẫn bị resolver lấy
        cookie. Cookie Max-Age (`AuthCookieProperties:30`, mặc định 15m) khớp
        `jwt.ttl: 15m` nên ca hết hạn thuần tự hết khi browser xóa cookie,
        NHƯNG JWT bị revoke (`RevokedTokenValidator`,
        `SecurityConfig.java:106`) hoặc xoay khóa RSA để lại cookie còn sống
        mà token invalid → user 401 ngay cả khi đăng nhập lại.
  - [ ] ⛔ **Allowlist theo method+path, TUYỆT ĐỐI không wildcard
        `/api/auth/**`** (sửa cách diễn đạt sai ở v4). Namespace `/api/auth`
        còn chứa các endpoint BẮT BUỘC có JWT: `GET /api/auth/me`
        (`AuthController.java:78`), `PATCH /api/auth/me/profile` (`:84`),
        `PATCH /api/auth/me` (`:92`), và sign-out-all sắp thêm. Dùng
        `startsWith("/api/auth/")` hay matcher `/api/auth/**` sẽ khiến cả bốn
        endpoint này mất `@AuthenticationPrincipal Jwt` → NPE/401 vĩnh viễn và
        vô hiệu hóa luôn sign-out-all. Resolver chỉ trả `null` cho đúng 5 cặp:
    - `POST /api/auth/login`
    - `POST /api/auth/otp/request`
    - `POST /api/auth/otp/verify`
    - `POST /api/auth/session/refresh`
    - `POST /api/auth/logout`
    - Dùng `List<RequestMatcher>` (`PathPatternRequestMatcher` có method) và
      test một ca `GET /api/auth/me` với JWT hợp lệ → 200, để wildcard hồi quy
      bị bắt ngay.
  - [ ] **Sign out all devices** (endpoint mới): yêu cầu JWT hợp lệ + CSRF,
        trong **một transaction** thực hiện: tăng `users.auth_version` +
        `trustedDeviceService.revokeAll(userId)`.
    - ⛔ **KHÔNG gọi `tokenRevocationService.revoke(userId)`** (bản trước ghi
      vậy là sai): đó chính là marker Redis mà H8 đang loại bỏ, và dùng lại nó
      sẽ tái tạo đúng lỗi H8 sửa — sign-out-all xong đăng nhập lại vẫn 401 tới
      15 phút.
  - [ ] Test bắt buộc — phải là **integration test chạy qua đầy đủ
        SecurityFilterChain** (`@SpringBootTest` + `MockMvc` có
        `springSecurity()`), KHÔNG phải standalone controller test: standalone
        bỏ qua `BearerTokenAuthenticationFilter` nên sẽ xanh giả đúng ở chỗ
        đang lỗi.
    - logout chỉ thu hồi đúng 1 device (device khác vẫn refresh được);
    - logout 2 lần đều 200;
    - cookie JWT hết hạn + device cookie → 200;
    - cookie JWT sai chữ ký → 200;
    - không có JWT → 200;
    - sign-out-all thu hồi mọi device + JWT;
    - sign-out-all với JWT hết hạn → 401 (endpoint này vẫn phải resolve JWT).
  - ⚠️ GitNexus impact quanh `revokeAll()`: **HIGH** — chạm luồng refresh,
    replay detection, lock organizer. Chạy `impact` trước khi sửa, thêm test
    cho cả 3 luồng.

- [ ] **H6. Bootstrap fail-fast — tách hai tầng validation** —
      `BootstrapSuperAdminRunner.java:26` skip im lặng kể cả khi email đã là
      student. Không đặt validation trong `BootstrapAdminProperties` (record
      bind ở mọi profile — throw ở đó vỡ dev/test):
  - [ ] **Tầng cấu hình** — `ProductionSecretsValidator` (`@Profile("prod")`):
        fail startup nếu ít hơn 2 bootstrap email, email sai định dạng, hoặc
        trùng nhau trong cấu hình. Thuần config, không đụng DB.
  - [ ] **Tầng dữ liệu** — `BootstrapSuperAdminRunner` (hoặc runner
        `@Profile("prod")` riêng), chạy SAU Flyway, trong transaction:
        email đã tồn tại nhưng row KHÔNG phải `ACTIVE + SUPER_ADMIN +
        EMAIL_OTP` → fail startup; sau bootstrap, assert cuối: **mọi**
        bootstrap mailbox đều tồn tại dưới dạng `ACTIVE + SUPER_ADMIN +
        EMAIL_OTP`. Cách tách này rõ thứ tự startup và integration-test được.
  - [ ] Tooling: `generate-env.sh` nhận danh sách email phẩy (backend hỗ trợ
        sẵn qua `BootstrapAdminProperties.emails()`) + cập nhật usage/docs.
  - [ ] ⛔ **Preflight phải cấm email giả** — sau khi reset DB (C3), runner sẽ
        tạo SUPER_ADMIN cho **mọi** địa chỉ trong `BOOTSTRAP_ADMIN_EMAIL`, nên
        một giá trị ví dụ lọt vào là tự sinh lại tài khoản ma:
    - `generate-env.sh:14` đang lấy ví dụ `admin@example.com` — đổi sang
      placeholder không thể chạy được, hoặc bắt buộc nhập.
    - Preflight hiện chỉ kiểm "có vẻ hợp lệ": phải chặn thêm `example.com`,
      `example.org`, `vidu.com`, và các email demo cũ đã từng dùng.
    - Yêu cầu tối thiểu 2 mailbox thật **đã xác nhận nhận được OTP** trước khi
      tuyên bố bootstrap xong (nối với H1).
  - Không cần check SMTP placeholder — preflight đã chặn (`common.sh:42`).

- [ ] **H7. Deactivate club bị vượt qua bằng đăng nhập OTP mới** (nâng từ M3
      — M3 chỉ thu hồi phiên ĐANG có, không chặn phiên MỚI). `activeAdmin()`
      (`AdminOtpService.java:103-106`) chỉ lọc `EMAIL_OTP + status ACTIVE`,
      không xét `user.getClub().isActive()`; `refresh()` (`:95-98`) lọc y hệt.
      Còn `deactivateClub` (`AdminManagementService.java:91-96`) chỉ gọi
      `club.deactivate()`, KHÔNG đụng tới row user. Nên organizer của club đã
      deactivate vẫn `ACTIVE` → xin OTP mới → nhận JWT mới → thao tác bình
      thường. Hiện là bypass **tức thì**; kể cả sau khi M3 thêm revoke thì vẫn
      bypass được sau khi key Redis hết 15 phút.
  - [ ] Policy đăng nhập chung, tách thành **predicate trên `User`** —
        `isEligibleAdmin(User)` hoặc `AdminAccessPolicy` — KHÔNG đặt trong
        `activeAdmin(email)`. Lý do: `refresh()` (`AdminOtpService.java:90-101`)
        tra user bằng `findById`, không đi qua `activeAdmin(email)`; nếu bám
        câu chữ "đặt trong activeAdmin" thì refresh vẫn lọt.
    - `SUPER_ADMIN`: chỉ cần account `ACTIVE` (không thuộc club nào).
    - `ORGANIZER`: account `ACTIVE` **và** có club **và** `club.isActive()`.
  - [ ] Gọi predicate đó từ cả **ba** đường: request OTP, verify OTP,
        trusted-device refresh. Verify phải kiểm tra lại ngay trước khi mint
        JWT — không tin vào kiểm tra lúc gửi OTP (club có thể bị deactivate
        giữa hai bước).
  - [ ] Đối chiếu với `AuthApplicationService.login():41-46` — đường Microsoft
        ĐÃ chặn `club.isActive()` rồi.
    - ⛔ **KHÔNG cho `login()` dùng thẳng predicate admin** (gợi ý v7 SAI):
      sau H3, Microsoft chỉ dành cho `SINH_VIEN`, còn predicate H7 chỉ chấp
      nhận `SUPER_ADMIN`/`ORGANIZER` — tái dùng trực tiếp sẽ **khóa toàn bộ
      đăng nhập sinh viên**.
    - Chọn một: giữ policy Microsoft riêng, HOẶC làm
      `SessionEligibilityPolicy` phân nhánh rõ theo `auth_method` + `role`
      (`MICROSOFT` → chỉ `SINH_VIEN`; `EMAIL_OTP` → `SUPER_ADMIN` cần account
      ACTIVE, `ORGANIZER` cần thêm club ACTIVE).
  - [ ] ⛔ **Chống race "check rồi mới mint"** — "kiểm tra lại ngay trước khi
        mint" là CHƯA đủ, vì đọc trạng thái và mint không nằm trong cùng một
        đơn vị nguyên tử với thao tác lock/deactivate:
    - Refresh đọc organizer đang `ACTIVE`, predicate cho qua.
    - Admin `lockOrganizer` (hoặc `deactivateClub`) commit + tăng epoch.
    - Refresh mint tiếp, đọc epoch **sau** khi đã tăng → token mới mang epoch
      hiện hành → validator chấp nhận, dù tài khoản vừa bị khóa.
    - Code hiện không có pessimistic lock, cũng không có version ràng buộc
      theo transaction cho việc này.
  - [ ] ⛔ **Đính chính v15 — bỏ cách diễn đạt "chốt một phương án".** Bản
        trước nói "chốt một trong A/B" nhưng cuối mục lại bắt làm **cả hai**;
        hai câu đó mâu thuẫn và người thi công sẽ làm thiếu một lớp. Thiết kế
        cuối cùng là **hai lớp cùng tồn tại**, không phải hai lựa chọn:
    - **Lớp 1 — row lock / conditional check ngay trước mint** (nội dung A):
      để token sai **không bao giờ được cấp** trong race.
    - **Lớp 2 — `users.auth_version`** (nội dung B, dùng chung hạ tầng H8):
      tăng khi **lock, deactivate club, unlock VÀ reactivate club** — để token
      lỡ sinh ra không sống lại sau khi mở khoá.
    - Bỏ lớp 1 → vẫn mint được token sai. Bỏ lớp 2 → token đó hồi sinh khi
      unlock (kịch bản 6 bước bên dưới). Cả hai đều là yêu cầu bảo mật.
  - Nội dung chi tiết của từng lớp:
    - **Lớp 1**: khóa cùng row user/club (`SELECT ... FOR UPDATE`) theo thứ tự
      nhất quán ở cả hai phía login/refresh và lock/deactivate.
    - **Lớp 2**: thêm cột bền vững `users.auth_version`, tăng trong
      **cùng transaction** với thao tác đổi trạng thái (lock, deactivate club
      → tăng cho mọi organizer của club). Mint đọc `auth_version` trong cùng
      transaction đã đọc user, đưa vào claim; validator so khớp.
      **DB là nguồn sự thật duy nhất** — H8 chốt không dùng Redis trong đường
      validate ở phiên bản đầu.
    - ⛔ Đính chính lập luận sai của bản trước: "cùng chạm một row trong một
      transaction nên DB serialize giúp" là **KHÔNG đúng** — một `SELECT`
      thường không khóa row trước `UPDATE` của transaction khác, nên đọc
      user/`authVersion` trong transaction chưa đóng được race.
    - ⛔ **Đính chính lần hai (v13 vẫn sai)**: "token lỡ mint chỉ vô dụng"
      **chỉ đúng trong lúc tài khoản còn khóa**. Kịch bản hồi sinh:
      1. Refresh kiểm tra organizer đang `ACTIVE`.
      2. Admin lock/deactivate, `auth_version` 0 → 1.
      3. Refresh chạy tiếp, đọc version **1**, mint token version 1.
      4. Token 401 trong lúc trạng thái `LOCKED`/club inactive — đúng.
      5. Admin unlock/reactivate nhưng **không tăng version lần nữa**.
      6. Token version 1 chưa hết hạn → **hợp lệ trở lại**.
      Vậy đóng race KHÔNG phải tùy chọn tối ưu, mà là yêu cầu bảo mật.
    - Bắt buộc làm **cả hai** cho chắc:
      - Row lock / conditional eligibility check ngay trước mint (xem phương
        án (a) ở H8) để token đó không bao giờ được cấp.
      - **Tăng `auth_version` cả khi unlock và reactivate club** — để mọi
        token/device lỡ sinh ra trong lúc khóa không thể sống lại. (Trước giờ
        checklist chỉ tăng version lúc khóa, không tăng lúc mở.)
    - Latch test phải assert token bị từ chối **sau khi unlock/reactivate**,
      không chỉ trong lúc còn khóa — đây mới là ca bắt được lỗi này.
  - [ ] ⚠️ Lưu ý về lập luận: nếu validator thật sự đọc trạng thái user/club
        từ DB ở **mọi** request (theo H8 bản không cache), thì kịch bản race
        "mint token hiện hành → validator chấp nhận" KHÔNG còn đúng — token
        vừa mint vẫn 401 ngay request kế tiếp. Test race vẫn cần cho tính đúng
        đắn của luồng mint, nhưng **không được dùng nó để biện minh cho một
        cache có quyền phê duyệt token**.
  - [ ] Test tái hiện race bằng latch (bắt buộc, không phải test tuần tự):
        chặn luồng refresh ngay SAU eligibility check → chạy
        lock/deactivate ở luồng khác cho tới commit → thả luồng refresh cho
        mint xong → assert token cuối cùng **bị từ chối**. Làm cho cả
        `lockOrganizer` và `deactivateClub`.
  - [ ] Từ chối bằng đúng lỗi 401 chung `rejected()` — không tiết lộ "club bị
        khóa" cho người chưa xác thực.
  - [ ] Giữ nguyên yêu cầu của M3, nhưng theo cơ chế H8: deactivate tăng
        `auth_version` trong cùng transaction (KHÔNG tạo marker Redis) +
        `revokeAll()`
        trusted device cho mọi organizer thuộc club (chặn phiên đang chạy).
  - [ ] Test: organizer club inactive → request OTP im lặng, verify 401,
        refresh 401; super admin không bị ảnh hưởng; reactivate club →
        organizer đăng nhập lại được (ca này phụ thuộc H8).
  - ⚠️ Chạy GitNexus `impact` trên `activeAdmin()` trước khi sửa (không chép
    số symbol vào đây — xem ghi chú ở H8). Công cụ có thể chấm mức thấp, nhưng
    đây là đường xác thực nên **vẫn phải review tay**: chạm cả hai luồng
    request và verify OTP.

- [ ] **H8. Revocation kiểu boolean chặn nhầm JWT mới cấp** —
      `TokenRevocationService.revoke()` (`:29-31`) ghi `"1"` theo userId sống
      15 phút; `RevokedTokenValidator` (`:21-28`) từ chối **mọi** JWT có
      subject đó khi key còn tồn tại, kể cả token mint SAU thời điểm revoke:
  - [ ] Hệ quả phải fix trước khi H5/H7 lên production, vì chính chúng tạo ra
        kịch bản "revoke rồi đăng nhập lại":
    - Sign-out-all → đăng nhập OTP lại ngay: server cấp JWT mới nhưng mọi API
      vẫn 401 tới 15 phút. Endpoint mới của H5 sẽ "hỏng" ngay khi ra mắt.
    - Reactivate club (H7) → organizer đăng nhập lại: JWT mới vẫn bị từ chối.
    - Unlock organizer cũng vướng y hệt.
  - [ ] Đổi sang **version bền vững trong PostgreSQL**, KHÔNG dùng mốc thời
        gian và KHÔNG dùng epoch chỉ nằm trong Redis (v7 để hai thiết kế mâu
        thuẫn nhau — H7 chốt DB là nguồn sự thật, H8 lại chốt Redis; nay hợp
        nhất về DB, xem bảng LOẠI):
    - `users.auth_version BIGINT NOT NULL DEFAULT 0`, migration `V12` (xem H3
      về đánh số).
    - ⛔ **Field riêng, KHÔNG tái dùng `@Version`** — `User.java:31-33` đã có
      `@Version private long version` phục vụ optimistic lock (V8). Thêm
      `private long authVersion` ánh xạ `auth_version`, tách bạch hoàn toàn:
      `version` tăng mỗi lần UPDATE bất kỳ (đổi tên hiển thị, cập nhật hồ sơ),
      nếu dùng nó làm mốc thu hồi thì **sửa hồ sơ cũng đăng xuất người dùng**.
      Chỉ thao tác bảo mật — lock, deactivate club, sign-out-all — mới tăng
      `authVersion`.
    - JWT mang claim `auth_version`; mint đọc giá trị trong **cùng
      transaction** đã đọc user.
    - Mọi thao tác thu hồi — `lockOrganizer`, `deactivateClub`, sign-out-all —
      tăng `auth_version` **trong chính transaction DB** đổi trạng thái.
    - Validator chấp nhận **chỉ khi** claim **bằng** giá trị hiện hành. So
      bằng/khác nên không phụ thuộc đồng hồ, không có vùng mờ mili-giây — đây
      là lý do bỏ `revokedBefore` theo timestamp của v6.
    - Token cũ không có claim `auth_version` → từ chối (fail-closed), không
      mặc định `0`.
  - [ ] ⛔ **Vì sao KHÔNG để epoch chỉ trong Redis** (thiết kế v7, đã loại):
    - PostgreSQL và Redis không commit nguyên tử với nhau: DB commit `LOCKED`
      xong mà Redis `INCR` lỗi thì token cũ vẫn hợp lệ — mất hẳn tác dụng thu
      hồi.
    - TTL mang nghĩa "reset version" là sai: revoke lúc t0 (epoch 1, key sống
      15 phút) → đăng nhập lúc t0+14m nhận token epoch 1 đáng lẽ sống tới
      t0+29m → t0+15m key hết hạn, Redis trả 0 → token hợp lệ **chết sớm 14
      phút**. Lập luận "key mất = an toàn theo hướng chặt" của v7 chỉ đúng cho
      token cũ, bỏ qua chiều ngược lại này.
    - Nếu JWT TTL từng bị đổi, key epoch có thể hết hạn trước một token cũ
      mang epoch 0 → token đó **sống lại**.
  - [ ] ⛔ **Phiên bản đầu: KHÔNG cache gì cả** — validator đọc projection
        PostgreSQL ở **mọi request**. Thiết kế "cache-aside" của v8 vẫn hổng:
        một cache hit cũ có thể **phê duyệt** token đã bị thu hồi, đúng bằng
        khoảng tuổi cache. Đó là lỗ hổng thu hồi phiên thật, không phải chi
        tiết tối ưu.
    - DB lỗi → **từ chối** request (fail-closed).
    - **Validator `auth_version` không có phụ thuộc Redis nào** — sau khi xóa
      `RevokedTokenValidator`, đường kiểm JWT không chạm Redis, nên Redis
      outage không ảnh hưởng bước này. (Các bản trước còn ghi "Redis lỗi thì
      bỏ qua Redis, đọc DB" là tàn dư của thiết kế cũ — bỏ hẳn.)
    - Chỉ thêm cache SAU khi có thiết kế **"cache chỉ được TỪ CHỐI, không bao
      giờ được PHÊ DUYỆT"** — nghĩa là cache hit chỉ dùng để chặn sớm; muốn
      cho qua thì vẫn phải xác nhận ở DB. Ghi thành mục riêng, đừng gộp vào
      đợt này.
  - [ ] Validator đọc một projection gọn trong một truy vấn: user còn tồn tại,
        `status`, trạng thái club, và `auth_version` — gộp luôn kiểm tra của H7
        thay vì mỗi thứ một đường.
    - ⚠️ Cân nhắc chi phí: mỗi request có thêm **một truy vấn PostgreSQL**
      (phiên bản đầu không cache — xem mục trên). Đây là cái giá phải trả để
      bỏ mô hình stateless thuần; ghi rõ vào docs vận hành và theo dõi độ trễ
      sau khi bật.
  - [ ] ⛔ **Race trusted-device: successor thoát `revokeAll()`** — thu hồi
        JWT bằng `auth_version` là chưa đủ, vì đường device cookie vẫn sống:
    - `revokeAll()` (`TrustedDeviceService.java:64-67`) chỉ revoke các row
      **có tại thời điểm `findByUserId`**.
    - `refresh()` (`AdminOtpService.java:90-101`) gọi `exchange()` (revoke row
      cũ) rồi mới `remember()` (insert successor) — hai bước tách rời.
    - Trình tự hỏng: refresh revoke xong row cũ → dừng trước `remember()` →
      sign-out-all tăng `auth_version` + `revokeAll()` + commit → refresh chạy
      tiếp, đọc `auth_version` **mới**, insert successor và mint JWT hợp lệ.
      Kết quả: sau sign-out-all người dùng vẫn còn CẢ JWT hợp lệ LẪN device
      cookie dùng được.
    - Với `lockOrganizer`/`deactivateClub` còn tệ hơn: successor nằm lại và
      dùng được ngay khi tài khoản được unlock/reactivate.
  - [x] ⛔ **KHỐI "chọn phương án (a)/(b)" ĐÃ BỊ XÓA (v15).** Nó mâu thuẫn với
        phần chốt bên dưới và là nguồn của việc H5/H8/M3 dẫn ba cơ chế logout
        khác nhau. Thiết kế cuối cùng **không phải lựa chọn**, mà là:
    - **Row lock** (`SELECT ... FOR UPDATE` trên user row) ở TẤT CẢ đường chạm
      trusted device: verify OTP, refresh, logout, sign-out-all, lock,
      deactivate, unlock, reactivate. Row lock đóng ca race mint, **nhưng không
      đóng ca logout ⟂ refresh** — xem ngay dưới.

  - [ ] ⛔ **CHỐT THỨ TỰ KHÓA — "thứ tự nhất quán" là chưa đủ, phải nói rõ thứ
        tự nào.** Code hiện tại đã đi **ngược** với thiết kế mới, nên đây là
        deadlock thật chứ không phải rủi ro lý thuyết:
    - `AdminOtpService.refresh()` (`:94-95`) gọi `trustedDeviceService
      .exchange()` — **mutate `trusted_devices` trước** — rồi mới
      `userRepository.findById(userId)`. Tức **device → user**.
    - Trong khi sign-out-all / `lockOrganizer` / `deactivateClub` theo thiết kế
      mới sẽ **khóa user trước** rồi mới revoke device. Tức **user → device**.
    - Hai chiều ngược nhau chạy đồng thời = deadlock cổ điển. PostgreSQL sẽ
      giết một transaction, người dùng nhận 500 ngẫu nhiên trên đường đăng
      nhập.
    - **Hierarchy chốt cứng, mọi đường phải tuân theo:**
      1. Đọc **không khóa** chỉ để tìm ID (ví dụ `findByTokenHash` để lấy
         `user_id` / `device_family_id`). Bước này **không được mutate**.
      2. `clubs` (nếu luồng có chạm) — `SELECT ... FOR UPDATE`.
      3. `users` — `SELECT ... FOR UPDATE`, **theo UUID tăng dần** nếu phải
         khóa nhiều user (ca `deactivateClub` khóa mọi organizer của club).
      4. `trusted_devices` — mutate sau cùng.
    - ⛔ **Cấm gọi `revokeIfActive()` (hay bất kỳ mutate nào trên
      `trusted_devices`) trước khi đã khóa user tương ứng.** Đây chính là thứ
      `exchange()` đang làm sai và phải sửa cùng H8.
    - Sau khi lấy được lock, **đọc lại và xác minh** trong cùng transaction:
      token còn active, trạng thái user/club, và `auth_version`. Giá trị đọc ở
      bước 1 (không khóa) chỉ để định vị row, **không được dùng để ra quyết
      định**.
    - [ ] Test deadlock: chạy song song N lần `refresh()` và `deactivateClub()`
          trên cùng một club/user, assert **không có transaction nào bị
          PostgreSQL huỷ vì deadlock** (bắt `40P01`).
    - **CỘNG** lineage `device_family_id` + `issued_auth_version`
      (`V14__trusted_device_lineage.sql`, xem C3.-1) để đóng nốt ca đó và để
      M1 phân biệt được thế hệ.
    - Migration đã chốt là **V14 riêng**, KHÔNG nhét vào V12. Không còn gì để
      quyết định ở đây.

  - [ ] ⛔ **BẢNG CHỐT DUY NHẤT: đường nào revoke cái gì.** H5, H8 và M3 trước
        đây mô tả ba cơ chế khác nhau; mọi mục phải trỏ về bảng này:

    | Đường | Phạm vi revoke | Cấm |
    |---|---|---|
    | **Logout thường** | Row **active của đúng `device_family_id`** được suy ra từ token trình ra (kể cả khi token đó đã bị rotate) | ⛔ KHÔNG `revokeAll()` |
    | **Replay** (`revokeIfActive == 0`) | Xử lý theo `issued_auth_version` — xem quy tắc 3 nhánh ở M1 | ⛔ KHÔNG `revokeAll()` |
    | **Sign-out-all** | `revokeAll()` toàn user + bump `auth_version` | — |
    | **Lock organizer** | `revokeAll()` toàn user + bump `auth_version` | — |
    | **Deactivate club** | `revokeAll()` cho **mọi organizer của club** + bump `auth_version` từng người | — |

    - Nói cách khác: `revokeAll()` **chỉ** còn ba chỗ gọi (sign-out-all, lock,
      deactivate). Mọi chỗ khác dùng family scope.
    - ✅ **H5 và M3 đã được sửa TRỰC TIẾP tại chỗ** (v15) để khớp bảng này —
      không còn nhiệm vụ "sửa mục khác" nằm trong H8. Người thi công H5 chỉ cần
      đọc H5; người thi công M3 chỉ cần đọc M3; cả hai trỏ ngược về bảng này
      cho phần **phạm vi**. Nếu sau này bảng thay đổi, sửa ở đây rồi rà lại hai
      con trỏ đó.
    - [ ] Test chống hồi quy: grep toàn repo, assert `revokeAll(` chỉ xuất hiện
          ở ba call site trong bảng (sign-out-all, lock organizer, deactivate
          club) — đặc biệt **không** còn trong `exchange()`.

  - [ ] ⛔ **Chiến lược nâng cấp `trusted_devices` đang có dữ liệu** — V14 thêm
        hai cột `NOT NULL`, nhưng nếu C3.0 chốt **Phương án 2** thì bảng V11 có
        thể đang chứa device token thật đang hoạt động. Hai rủi ro:
    - Thêm thẳng `NOT NULL` khi chưa backfill → migration **fail**, container
      không khởi động được.
    - Backfill `issued_auth_version = 0` mà **không revoke row cũ** → cookie
      30 ngày cũ vẫn gọi refresh được và lấy JWT mới. Khi đó tuyên bố "deploy
      H8 sẽ đăng xuất mọi phiên cũ" là **SAI**: JWT cũ chết, nhưng device
      cookie vẫn sống và đẻ ra JWT mới hợp lệ.
    - [ ] Thứ tự bắt buộc trong V14:
      1. Thêm hai cột **nullable**.
      2. **Mỗi row V11 hiện có nhận MỘT `device_family_id` mới, riêng biệt**
         (`gen_random_uuid()` cho từng row).
         - ⛔ **KHÔNG cố suy đoán "chuỗi device cũ"** (cách diễn đạt sai ở bản
           nháp v15). `V11__trusted_devices.sql:3-11` chỉ có `id`, `user_id`,
           `token_hash`, `created_at`, `expires_at`, `last_used_at`,
           `revoked_at` — **không có `replaced_by`, không có family, không có
           bất kỳ liên kết nào giữa token cũ và successor**. Lineage đơn giản
           là **không tồn tại** trong dữ liệu cũ, nên không thể khôi phục.
         - ⛔ Cũng KHÔNG suy đoán bằng `user_id` + mốc thời gian: một user có
           nhiều thiết bị thật, gộp chúng vào một family sẽ khiến logout ở máy
           này đá văng máy kia.
         - Gán mỗi row một family riêng là **an toàn và đủ**, chính vì bước 3
           revoke tất cả — không row cũ nào còn sống để lineage sai gây hại.
      3. **Đánh dấu toàn bộ trusted-device cũ là `revoked`** — đây là bước
         không được bỏ, chính nó làm tuyên bố "đăng xuất mọi phiên cũ" thành
         đúng, **và** là thứ khiến việc gán family tuỳ ý ở bước 2 vô hại.
      4. Điền `issued_auth_version` từ `users.auth_version` của user tương ứng
         (join theo `user_id`).
      5. Chỉ khi đó mới `SET NOT NULL` + thêm index + constraint.
    - [ ] Thêm **partial unique index** bảo đảm mỗi family tối đa **một** row
          active: `CREATE UNIQUE INDEX ... ON trusted_devices(device_family_id)
          WHERE revoked_at IS NULL`. Đây là invariant mà toàn bộ logic logout/
          replay ở trên dựa vào — không có index thì một bug rotate sẽ âm thầm
          tạo hai successor.
    - [ ] **Migration test V11 → latest với trusted device đang active** (bổ
          sung cho M4): tạo device active ở schema V11, migrate, rồi assert
          **cookie đó KHÔNG refresh được nữa**. Không có test này thì bước 3 ở
          trên rất dễ bị bỏ quên.
  - [ ] Latch test bắt buộc: dừng refresh **sau `revokeIfActive` nhưng trước
        `remember`** → chạy sign-out-all (và bản riêng cho lock, deactivate)
        tới commit → thả refresh → assert: không còn active successor, JWT vừa
        mint bị từ chối, và cookie cũ không refresh lại được.
  - [ ] Thêm ca: **logout thường** chạy đồng thời với refresh cùng device —
        không được để logout revoke row cũ trong khi refresh vừa tạo successor.
  - [ ] **Dọn cơ chế cũ sau khi H8 xong** — để lại hai đường song song là mời
        gọi hồi quy:
    - Bỏ `RevokedTokenValidator` khỏi chuỗi validator của `jwtDecoder`
      (`SecurityConfig.java:104-106`).
    - Xóa `TokenRevocationService` (hoặc ít nhất gỡ khỏi mọi đường validate và
      mọi caller: `lockOrganizer`, sign-out-all, `deleteOrganizer`).
    - Grep toàn repo còn `tokenRevocationService` / `isRevoked` → phải sạch.
  - ⚠️ GitNexus: `InternalJwtService.mint()` mức **CRITICAL**. KHÔNG chép số
    symbol vào đây — con số phụ thuộc target/UID và index tại thời điểm chạy,
    các bản trước ghi 38/39 nhưng chạy lại với exact UID cùng SHA cho kết quả
    khác hẳn (mint ~11 symbol / 5 flow / 3 module; `SessionMinter.mint` ~10/5/2;
    `activeAdmin` ~4/2 — công cụ chấm LOW nhưng vẫn phải review tay vì là auth).
    Chạy `impact` ngay trước khi sửa và đọc số tại chỗ.
  - [ ] ⛔ **TUYỆT ĐỐI KHÔNG xóa key revocation khi mint** (đề xuất v5 SAI,
        đã loại). Xóa key làm token cũ **sống lại**: kẻ tấn công giữ token A →
        nạn nhân sign-out-all (tạo `revokedBefore`) → nạn nhân đăng nhập lại,
        mint token B → key bị xóa → **token A hợp lệ trở lại**. Sign-out-all
        mất sạch ý nghĩa. Lý do biện hộ ở v5 ("mint chỉ xảy ra sau policy H7")
        là sai: `SessionMinter.mint()` còn chạy ở `updateProfile`
        (`AuthApplicationService.java:67`) và `updateDisplayName` (`:84`) —
        hai đường không kiểm lại điều kiện gì, cũng như Microsoft login
        (`:48`) và trusted-device refresh (`AdminOtpService.java:100`).
        ⚠️ GitNexus: sửa `InternalJwtService.mint()` mức **CRITICAL** (không
        chép số symbol — chạy `impact` tại chỗ, xem ghi chú cuối H8).
  - [ ] Giữ `iat` chuẩn dạng giây cho đúng chuẩn JWT, nhưng **không dùng nó
        để quyết định revocation** — `InternalJwtService.java:35` truncate
        `iat` xuống giây nên không phân biệt được token trước/sau revoke trong
        cùng một giây. Chuyển sang mili-giây cũng KHÔNG giải quyết triệt để:
        mint và revoke vẫn có thể rơi đúng cùng một mili-giây, khi đó `<=` từ
        chối nhầm token mới còn `<` cho lọt token cũ. Epoch không có vấn đề
        này vì so sánh là bằng/khác, không phải trước/sau.
  - [ ] Test bắt buộc: token cũ bị từ chối; token mint sau revoke được chấp
        nhận; sign-out-all → login lại dùng được ngay; deactivate → OTP và
        refresh đều bị chặn; reactivate → login mới chạy, token cũ vẫn bị từ
        chối.
  - [ ] Test chống hồi sinh (bắt buộc, đây là ca v5 làm sai): mint A → revoke
        → mint B **trong cùng một giây** → A bị từ chối, B được chấp nhận,
        `users.auth_version` trong DB vẫn giữ giá trị mới, và lặp lại đăng
        nhập/`PATCH /api/auth/me` bao nhiêu lần cũng KHÔNG làm A sống lại.
        Thêm ca: cache cũ hoặc Redis mất kết nối cũng không được làm A sống
        lại.
  - [ ] Test **claim dị dạng** — claim `auth_version` đến từ token do client
        trình ra nên phải coi là input không tin được, mọi ca dưới đây đều
        phải 401 chứ không được 500 hay lọt:
    - thiếu hẳn claim;
    - claim là chuỗi thay vì số (`"5"`, `"abc"`);
    - số âm, hoặc lớn hơn `Long.MAX_VALUE`;
    - **số thập phân** (`1.5`) — ca này quan trọng: nếu code chỉ gọi
      `Number.longValue()` thì `1.5` bị lặng lẽ cắt thành `1` và **khớp nhầm**
      với version 1 thay vì bị từ chối;
    - `sub` không phải UUID hợp lệ;
    - DB ném exception lúc đọc projection → từ chối (fail-closed), có log.
  - [ ] ⚠️ **Triển khai H8 = đăng xuất toàn bộ phiên đang có** (token cũ
        không có claim `auth_version` → bị từ chối). Đúng về bảo mật nhưng
        phải xử lý như **maintenance event**:
    - Kiểm tra SMTP + gửi OTP thật tới từng bootstrap mailbox **TRƯỚC** khi
      deploy — nếu mail hỏng thì mọi admin bị khóa ngoài, không có đường vào
      (H1 cùng lý do).
    - Báo trước cho người dùng, chọn giờ thấp điểm, ghi vào
      `PRODUCTION_DEPLOYMENT_VI.md`.
    - ⛔ **KHÔNG phải "chuẩn bị sẵn break-glass SQL"** (câu cũ, mâu thuẫn với
      H1/H14 đã sửa). H8 là maintenance làm **mọi JWT cũ mất hiệu lực**; nếu
      SMTP hỏng đúng lúc đó thì SQL đổi/tạo admin **không giúp ai đăng nhập
      được**, vì admin mới vẫn phải nhận OTP qua chính SMTP đang chết.
    - **Điều kiện tiên quyết đúng: H14 đã rehearsal THÀNH CÔNG** — SMTP dự
      phòng đã gửi thử được, hoặc one-time recovery code đã phát hành và thử
      đăng nhập được. Chưa có bằng chứng rehearsal thì **không deploy H8**.
  - [ ] ⛔ **Row lock KHÔNG đóng hết ca logout ⟂ refresh** —
        phát hiện v15, phải bổ sung vào thiết kế:
    - Refresh giành được lock trước: nó revoke device token A và tạo successor
      B, rồi nhả lock.
    - Logout chờ lock xong mới chạy, nhưng trong tay nó **chỉ có token A đã bị
      revoke**. Nó không có đường nào biết tới B → B sống tiếp. Thiết bị vẫn
      đăng nhập dù người dùng đã bấm đăng xuất.
    - Lock chỉ tuần tự hoá hai thao tác, **không** giúp thao tác sau tìm được
      thứ thao tác trước vừa tạo ra. Đây là lỗ hổng thiết kế, không phải lỗi
      thi công.
  - [ ] ⛔ **CHỐT MÔ HÌNH TRUSTED-DEVICE CUỐI CÙNG (v15)** — nháp v15 để mở
        "`device_family_id` **hoặc** `replaced_by`", trong khi M1 lại cần thêm
        khái niệm "thế hệ" mà không định nghĩa trường lưu bền vững. Để mở như
        vậy là chưa khép kín: hai mục sẽ được thi công lệch nhau. Chốt cứng:
    - **Migration `V14__trusted_device_lineage.sql`** (xem sơ đồ ở C3.-1), hai
      cột:
      - `device_family_id UUID NOT NULL` — **bất biến theo thiết bị**, sinh một
        lần lúc verify OTP thành công; mọi successor sinh ra do rotate đều
        **kế thừa nguyên vẹn**.
      - `issued_auth_version BIGINT NOT NULL` — `users.auth_version` tại thời
        điểm token đó được phát hành.
    - Chọn `device_family_id` **thay vì** `replaced_by`: `replaced_by` là danh
      sách liên kết, muốn tìm successor hiện hành phải duyệt chuỗi (O(n), và
      hỏng nếu đứt một mắt). `device_family_id` cho phép truy vấn trực tiếp
      "row active của family này" bằng một index.
    - **Rotate**: successor giữ **cùng** `device_family_id` và **cùng**
      `issued_auth_version` với token vừa consume. ⛔ TUYỆT ĐỐI không re-read
      `users.auth_version` rồi nâng successor lên version mới — đó đúng là
      đường race đã mô tả ở phương án (b) phía trên.
    - **Logout** (bất kỳ token nào của family, kể cả token đã revoke): tra
      `device_family_id` → revoke **row active hiện hành của family đó**. Đây
      là thứ đóng ca "logout chạy sau refresh" ở trên.
    - **Replay** (trình một token đã bị consume): ⛔ **KHÔNG mô tả lại quy tắc
      ở đây.** Bản nháp v15 chép lại hai nhánh (`<` và `==`) rồi kết luận "cả
      hai nhánh…", **bỏ mất nhánh `>`** mà M1 yêu cầu — người thi công đọc H8
      sẽ viết ra một `exchange()` **không fail-closed** khi dữ liệu lệch.
      Nguồn duy nhất là **quy tắc ba nhánh `issued_auth_version` ở M1**
      (`==` / `<` / `>`). H8 chỉ cung cấp hai cột; M1 định nghĩa cách so sánh.
    - Ràng buộc duy nhất H8 áp lên nhánh replay: **không đường nào được gọi
      `revokeAll()`** — xem bảng chốt phạm vi ở trên.
  - [ ] ⛔ **Kiểm `issued_auth_version` cho device CÒN ACTIVE, không chỉ khi
        replay** (bổ sung v15 — trước đây ba nhánh chỉ áp cho nhánh replay):
    - Đường hiện tại là `refresh()` → `exchange()` → `revokeIfActive()`
      (`AdminOtpService:94`, `TrustedDeviceService:56-60`). Nếu chỉ kiểm version
      ở nhánh replay thì một device **hợp lệ, chưa bị consume** vẫn đổi được
      lấy JWT mới **kể cả khi `auth_version` đã tăng** — chỉ cần một đường nào
      đó trong tương lai bump version mà quên gọi `revokeAll()`. Cookie sống 30
      ngày, nên lỗ hổng đó tồn tại rất lâu.
    - Đây là **defense in depth**: không phụ thuộc vào việc mọi đường bump
      version đều nhớ revoke device. `auth_version` trở thành nguồn sự thật duy
      nhất, đúng tinh thần H8.
    - **Quy tắc cho MỌI lần refresh**, áp **trước khi** consume/rotate:
      - `device.issued_auth_version` **==** `users.auth_version` → cho phép
        rotate.
      - **<** → **từ chối**, và revoke family nếu còn active (thế hệ cũ lọt
        lại).
      - **>** → **từ chối**, log ERROR + phát cảnh báo invariant (giống nhánh
        `>` của M1).
    - ⛔ **TUYỆT ĐỐI không mint JWT trước khi so sánh xong.** Thứ tự đúng:
      khóa user (theo hierarchy ở trên) → đọc `auth_version` → so sánh →
      mới consume/rotate/mint.
    - [ ] Test: bump `auth_version` **mà không** gọi `revokeAll()` → device
          cookie đang active gọi refresh → assert **bị từ chối**, không mint
          JWT nào.
    - **M1 dùng chung đúng hai cột này**, không thêm trường "generation" riêng.
    - Test bắt buộc: latch chặn logout ngay trước khi nó giành lock → cho
      refresh chạy trọn vẹn (A→B) → thả logout → assert **B cũng bị từ chối**.

- [ ] **H9. JWT cũ vượt qua việc MSSV đã bị đổi và quay về UNVERIFIED**
      (mới, v15 — đã kiểm chứng trên code):
  - Sự việc: `AuthApplicationService.updateProfile()` (`:59-68`) gọi
    `User.completeProfile()` (`User.java:125-129`), câu này **đặt lại
    `mssvStatus = UNVERIFIED`** và thay `mssv`. Nhưng
    `CurrentUser.from(Jwt)` (`:18-32`) lấy `mssv` và `mssv_verified` **hoàn
    toàn từ claim trong JWT**, và `TicketReservationService.submit()`
    (`:73-80`) chỉ đọc `actor.mssv()` / `actor.mssvVerified()`, **không hề đọc
    lại trạng thái hiện hành trong DB**.
  - Kịch bản khai thác:
    1. Sinh viên có MSSV `A` đã được admin verify → nhận JWT chứa
       `mssv=A, mssv_verified=true`. Giữ lại một bản sao token này.
    2. Gọi `PATCH /api/auth/me/profile` đổi sang MSSV `B`. DB: `mssv=B`,
       `mssv_status=UNVERIFIED`. `updateProfile` có mint token mới nhưng
       **không revoke token cũ**.
    3. Dùng JWT bản sao ở bước 1 để `POST /api/reservations`. `submit()` thấy
       `mssv_verified=true` → cho qua, và ghi `Reservation` mang MSSV `A`
       trong khi DB nói người này là `B` chưa verify.
  - Cửa sổ khai thác = `auth.jwt.ttl` (`application.yml:51`, mặc định **15m**)
    — hẹp nhưng đủ, và hậu quả là dữ liệu đăng ký sai MSSV + qua mặt gate
    "phải verify mới được đặt vé".
  - [ ] ⛔ **Đính chính v15 — KHÔNG gọi `TokenRevocationService`.** Bản nháp
        v15 ghi "gọi `tokenRevocationService.revoke(userId)` — hạ tầng đã có
        sẵn, rẻ". **Không dùng được**, vì hai lý do cộng dồn:
    - H8 bắt buộc **xóa `TokenRevocationService` và gỡ `RevokedTokenValidator`**
      khỏi chuỗi validator, kèm yêu cầu grep toàn repo phải sạch. Mà chính H9
      lại phải làm **SAU** H8 → đến lượt H9 thì service đó **không còn tồn
      tại**: code sẽ không biên dịch.
    - M3 cấm giữ revocation Redis song song với DB: transaction DB rollback vẫn
      để lại revocation ngoài transaction → user không bị khóa nhưng phiên đã
      chết. Giữ lại service để H9 dùng là tái tạo đúng lỗi H8 vừa sửa.
  - [ ] **Fix đúng — chỉ dùng `users.auth_version` (DB là nguồn sự thật duy
        nhất):**
    - Trong `updateProfile()`: nếu `mssv` hoặc `mssv_status` thay đổi → **tăng
      `users.auth_version` trong CÙNG transaction** với thao tác đổi dữ liệu.
    - **Mint token mới SAU khi version đã tăng**, đọc `auth_version` trong cùng
      transaction đó → token mới mang version mới, không bị chặn oan; mọi token
      cũ mang version cũ → validator từ chối.
    - Áp cùng quy tắc cho mọi thuộc tính bảo mật khác đổi: `email`, `role`,
      `club_id`, `status`. **Không** áp cho `displayName` (xem đính chính ngay
      dưới).
    - **Đường Microsoft login**: `resolveUser()` gọi `User.updateIdentity()`
      (`:111-115`) ghi đè `this.email` mỗi lần đăng nhập. Phải **so sánh email
      cũ ⟂ mới**; nếu khác → tăng `auth_version` **trước khi** mint. Không so
      sánh thì token cũ mang email cũ vẫn sống hết TTL.
    - ⛔ Không gọi `TokenRevocationService` ở **bất kỳ nhánh nào** của H9.
  - [ ] Test: token cũ (version cũ) bị **từ chối**; token vừa mint với version
        mới **hoạt động ngay** ở request kế tiếp (bắt được ca "revoke chặn oan
        token vừa cấp" — chính là bug H8 đang sửa).
  - [ ] Fix lớp hai (defense in depth): `submit()` đọc trạng thái MSSV hiện
        hành từ DB thay vì tin claim, hoặc ít nhất đối chiếu claim với DB
        trước khi tạo `Reservation`. JWT là cache, không phải nguồn sự thật cho
        một điều kiện có thể đổi giữa hai lần đăng nhập.
  - [ ] ⛔ **Đính chính v15 — H9 đang nhắm sai thuộc tính.** Nháp v15 bảo "áp
        cùng cách xử lý cho `updateDisplayName()`". **Sai**: `InternalJwtService
        .mint()` (`:38-53`) đặt các claim `email`, `roles`, `club_id`, `mssv`,
        `mssv_verified` — **không có `displayName`**. Bump `auth_version` khi
        đổi tên hiển thị chỉ **đăng xuất toàn bộ phiên của người dùng mà không
        vá lỗ hổng nào**. Bỏ yêu cầu này.
  - [ ] ⚠️ **Thứ thật sự bị bỏ sót là `email`** — cùng loại lỗi với `mssv`:
    - `InternalJwtService.mint():44` đưa `email` vào JWT.
    - `User.updateIdentity()` (`:111-115`) ghi đè `this.email` **mỗi lần đăng
      nhập Microsoft** — email hoàn toàn có thể đổi.
    - `TicketReservationService.submit():100` lấy `actor.email()` **từ JWT** để
      dựng `Reservation.pending(...)`, và email đó chảy tiếp vào outbox → là
      địa chỉ vé QR được gửi tới.
    - Hệ quả: trong cửa sổ TTL, token cũ ghi được reservation mang **email cũ**
      và khiến vé được gửi tới hộp thư cũ.
  - [ ] Phạm vi đúng của H9, chốt lại:
    - Bump `auth_version` **chỉ khi** thuộc tính bảo mật thật sự đổi: `mssv`,
      `mssv_status`, `email`, `role`, `club_id`, `status`. **Không** bump cho
      `displayName`.
    - `submit()` đọc **`email`, `mssv` và trạng thái verify hiện hành từ DB**,
      không tin claim. (Nháp v15 mới yêu cầu đọc lại MSSV — thiếu email.)
  - [ ] Test bổ sung: token cũ mang **email cũ** → đặt vé → assert
        `Reservation` và outbox mang **email hiện hành trong DB**, không phải
        email trong claim.
  - [ ] Test: verify MSSV `A` → giữ token → đổi sang `B` → dùng token cũ đặt
        vé → assert **403**, và assert không có `Reservation` nào mang MSSV `A`.
  - ⚠️ Chạy GitNexus `impact` trên `submit()` trước khi sửa — đây là đường đặt
    vé chính, blast radius **HIGH**.

- [ ] **H10. Artifact deploy không tái lập được — "đúng SHA" không chứng minh
      "đúng bytes đã test"** (mới, v15):
  - `deploy.sh:21` chạy `compose build --pull` **trên VPS**: image được build
    lại tại thời điểm deploy, không phải image CI đã test/scan. `--pull` còn
    chủ động kéo base image mới nhất, nên cùng một commit build ở hai thời
    điểm ra hai image khác nhau.
  - Mọi base image đều là tag **mutable**: `frontend/Dockerfile:1`
    (`node:24-alpine`), `:29` (`nginx:1.29-alpine`), cùng PostgreSQL / Redis /
    RabbitMQ / Caddy trong `compose.yaml`. GitHub Actions cũng chỉ pin theo
    major tag (`dorny/paths-filter@v3`, `ci.yml:19`).
  - Hệ quả trực tiếp: **rollback về commit cũ có thể dựng ra một image khác**
    với commit đó lúc trước — tức là rollback không đảm bảo quay về trạng thái
    đã biết. Điều này làm rỗng ruột mục "verify SHA" của C1 và mục M5.
  - [ ] Đích đến: build + test + scan **một lần trong CI** → push image lên
        registry → deploy bằng **digest** (`@sha256:...`), không bằng tag → lưu
        digest cùng release record để rollback trỏ đúng bytes.
  - [ ] Mức tối thiểu nếu chưa dựng được registry trong phạm vi đồ án: pin
        **toàn bộ** base image bằng digest và pin mọi GitHub Action bằng commit
        SHA. Ghi rõ đây là giải pháp tạm và vẫn còn rủi ro build-on-VPS.

- [ ] **H11. Ứng dụng chạy bằng tài khoản owner của PostgreSQL** (mới, v15):
  - `compose.yaml:64-66` truyền **cùng** `${POSTGRES_USER}` cho cả việc khởi
    tạo DB, Flyway migration và runtime của ứng dụng. Tài khoản này là owner,
    có toàn quyền DDL.
  - Hệ quả: một lỗ hổng SQL injection hay RCE ở tầng ứng dụng leo thẳng thành
    `DROP SCHEMA` / sửa cấu trúc bảng, thay vì bị giới hạn ở đọc-ghi dữ liệu.
  - [ ] Tách vai trò:
    - Migration owner: chỉ dùng cho Flyway, chạy như bước **one-shot** trước
      khi service lên.
    - Runtime user: chỉ `SELECT/INSERT/UPDATE/DELETE` trên các bảng nghiệp vụ,
      không `CREATE`/`DROP`/`ALTER`, không owner.
    - Tắt `spring.flyway.enabled` trong container runtime sau khi migration đã
      tách ra.
  - [ ] ⛔ **Mô hình cấp quyền phải viết ra cụ thể (mới, v16)** — bản v15 chỉ
    nói "tách vai trò" mà không định nghĩa grant, nên nếu chỉ grant một lần
    cho các bảng **hiện có** thì migration kế tiếp (V12–V14, và V15 nếu H13.1
    chốt (B)) sẽ tạo bảng mà runtime user **không đọc/ghi được** → app chết
    ngay sau lần deploy có migration mới. Tối thiểu:
    - `GRANT CONNECT ON DATABASE <db> TO <runtime_user>;`
    - `GRANT USAGE ON SCHEMA public TO <runtime_user>;`
    - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
      <runtime_user>;` + `GRANT USAGE, SELECT ON ALL SEQUENCES ...`
    - [ ] Và **một trong hai** cho bảng tương lai (chọn một, ghi vào runbook):
      - **(khuyến nghị)** `ALTER DEFAULT PRIVILEGES FOR ROLE <migration_owner>
        IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
        <runtime_user>;` (+ tương ứng `ON SEQUENCES`). Lưu ý default privileges
        chỉ áp dụng cho object do **đúng role đó** tạo — nên migration bắt
        buộc luôn chạy bằng `<migration_owner>`, không phải superuser nào khác.
      - Mỗi migration **kết thúc bằng grant tường minh** cho bảng nó vừa tạo.
        Rẻ hơn nhưng dễ quên; nếu chọn cách này thì phải có test chặn.
  - [ ] ⛔ **Restore phải khôi phục cả ownership lẫn privileges** —
    `restore-postgres.sh:70` đang chạy `pg_restore --no-owner
    --no-privileges`, nghĩa là sau restore **mọi object thuộc về user đang
    kết nối và toàn bộ GRANT bị bỏ**. Với mô hình một-user hiện tại thì vô
    hại; sau khi tách vai trò thì restore sẽ để runtime user **không có quyền
    gì** → site chết im lặng sau mỗi lần restore. Vì vậy:
    - Restore phải chạy **bằng `<migration_owner>`** để object thuộc về owner.
    - Ngay sau `pg_restore`, script phải chạy lại **toàn bộ khối grant +
      `ALTER DEFAULT PRIVILEGES`** ở trên (idempotent, chạy nhiều lần vô hại).
    - [ ] Bổ sung bước này vào `restore-postgres.sh` **và** vào drill restore
      của H13 — drill không kiểm quyền thì không phát hiện được.
  - [ ] ⛔ **Credentials của migration owner KHÔNG được xuất hiện trong
    container runtime** — không đặt trong `environment:` của service
    `monolith`, chỉ truyền cho job migration one-shot (`generate-env.sh` phải
    sinh hai cặp credential riêng, và `compose.yaml:64-66` chỉ nhận cặp
    runtime). Nếu app vẫn đọc được mật khẩu owner thì việc tách vai trò chỉ là
    trang trí.
  - [ ] Test: xác nhận runtime user **không** chạy được `CREATE` / `ALTER` /
        `DROP TABLE` (assert lỗi permission), và app vẫn hoạt động đầy đủ.
  - [ ] Test bảng-mới: sau khi chạy migration cuối (V14, hoặc V15 nếu chốt
        (B)), assert runtime user `SELECT`/`INSERT` được vào bảng **mới tạo**
        đó mà không cần thao tác grant thủ công nào.

- [ ] **H12. Container frontend chạy bằng root** (mới, v15 — Trivy xếp High):
  - `frontend/Dockerfile:29-36` không có chỉ thị `USER`, nên nginx master chạy
    root. Trong `compose.yaml` service `frontend` (`:30-52`) cũng **không** có
    `security_opt: no-new-privileges`, `cap_drop: ALL` hay `read_only` — trong
    khi service `monolith` (`:77-80`) thì có đủ. Đây là lệch chuẩn giữa hai
    service của cùng một stack, không phải quyết định có chủ đích.
  - [ ] Chuyển sang `nginxinc/nginx-unprivileged` (hoặc thêm `USER nginx` + cấu
        hình lại đường ghi pid/cache), phục vụ trên **8080** thay vì 80.
  - [ ] Cập nhật đồng bộ: `EXPOSE`, healthcheck `compose.yaml:45` (đang
        `wget ... http://127.0.0.1/`), và upstream `frontend:80` trong
        `Caddyfile:38` → `frontend:8080`. Bỏ sót một chỗ là container unhealthy
        hoặc 502 toàn site.
  - [ ] Thêm `security_opt: [no-new-privileges:true]` + `cap_drop: [ALL]` cho
        `frontend` cho khớp `monolith`.

- [ ] **H13. Restore có thể để hệ thống ở trạng thái nửa phục hồi** (mới, v15):
  - `restore-postgres.sh` drop + restore PostgreSQL **trước**, rồi mới xử lý
    Redis/RabbitMQ. Nếu bước broker hỏng, DB đã bị thay nhưng queue/cache vẫn
    mang dữ liệu của thế giới cũ — message tồn đọng sẽ gửi email/cấp vé cho
    những bản ghi vừa bị thay thế.
  - [ ] ⛔ **Preflight KHÔNG đủ (đính chính v15).** Nháp v15 đề xuất "kiểm tra
        quyền purge queue + Redis trước khi drop DB" — cái đó chỉ **giảm xác
        suất**, không đổi bản chất: nếu Redis flush, RabbitMQ purge hay bước
        requeue outbox hỏng **sau** khi PostgreSQL đã bị thay, hệ thống vẫn
        nằm ở trạng thái nửa restore và không có đường lùi. Thao tác phá huỷ
        tại chỗ thì không preflight nào cứu được.
  - [ ] **Dùng đúng mô hình blue-green của C3** — restore không được phép sửa
        tại chỗ stack đang chạy:
    1. Restore PostgreSQL vào **stack/volume mới** (project name riêng, đúng
       như C3 đã dựng cho cutover).
    2. Khởi tạo Redis + RabbitMQ **mới, rỗng** cho stack đó.
    3. Reconcile outbox ↔ queue trong stack mới (requeue những gì cần, bỏ
       message trỏ tới dữ liệu không còn tồn tại).
       ⛔ **Bước này hiện KHÔNG THỰC HIỆN ĐƯỢC AN TOÀN** — xem H13.1 ngay dưới.
       Blue-green cô lập được thao tác restore, nhưng **không** tạo ra nguồn sự
       thật về delivery mà bước 3 cần. Phải làm H13.1 trước.
    4. Nghiệm thu **toàn bộ stack trong cô lập** (smoke test đầy đủ, không có
       traffic thật).
    5. Chỉ khi (4) xanh mới **chuyển upstream Caddy** sang stack vừa restore.
    6. **Giữ nguyên stack cũ làm đường rollback** cho tới hết thời gian lưu
       giữ đã thoả thuận.
    - Mọi bước 1–4 đều có thể fail mà **không ảnh hưởng gì tới production đang
      chạy** — đó là điểm khác biệt so với `restore-postgres.sh` hiện tại.
  - [ ] ⛔ **H13.1 — Nguồn sự thật về delivery không sống sót qua restore**
        (mới, v15; điều kiện tiên quyết của bước 3 ở trên):
    - Chuỗi bằng chứng, đã kiểm trên code:
      - `OutboxRelayService.publish()` (`:31-32`) gọi `publisher.publish()` rồi
        **`markSent()` ngay**. Vậy trạng thái `SENT` chỉ có nghĩa **"broker đã
        nhận"**, KHÔNG chứng minh email/vé đã được gửi.
      - Bằng chứng "đã gửi thật" nằm ở `ReservationApprovedProcessor.process()`
        (`:44-45`): `mailSender.send(...)` thành công rồi mới
        `idempotencyStore.markDone(messageId)`.
      - `markDone` ghi key `notification:done:<messageId>`
        (`NotificationIdempotencyStore:48-49,58-59`) **chỉ vào Redis**, TTL
        `done-ttl` = **P30D** (`application.yml:55`).
      - Bước 2 của H13 lại dựng **Redis mới, rỗng** → toàn bộ bằng chứng
        delivery **biến mất**.
    - Hệ quả: bước 3 đứng trước hai lựa chọn đều sai:
      - Requeue mọi outbox `SENT` → **gửi trùng** vé/email cho những người đã
        nhận (idempotency store rỗng nên consumer không chặn được).
      - Không requeue `SENT` → **mất** những message đã publish nhưng consumer
        chưa kịp xử lý.
    - [ ] Chốt **một** phương án (khuyến nghị B):
      - **(A)** Khôi phục có chọn lọc `notification:done:*` từ một Redis
        snapshot **khớp thời điểm** với bản dump PostgreSQL, đồng thời bảo toàn
        message còn trong RabbitMQ. Nhược điểm: phải bảo đảm point-in-time
        consistency giữa ba store độc lập — khó chứng minh đúng, và vẫn hỏng
        nếu snapshot lệch.
      - **(B, khuyến nghị)** **Chuyển delivery ledger sang PostgreSQL**: bảng
        riêng khóa bằng `message_id` UNIQUE. Redis chỉ còn giữ **lock ngắn
        hạn** (`lock-ttl`), không còn giữ sự thật. `pg_dump`/`pg_restore` cuốn
        theo cả ledger → reconcile có nguồn **bền vững**, và blue-green tự
        nhiên đúng.
        - ⛔ **ĐÍNH CHÍNH v15 — bỏ câu "ghi trong cùng phạm vi giao dịch với
          việc gửi".** Câu đó **sai về nguyên lý**: gửi SMTP là side effect
          ngoài hệ thống, không thể nằm trong transaction PostgreSQL. Cửa sổ
          crash tồn tại theo cả hai chiều và (B) **không** xoá được nó:
          - Ghi ledger **sau** khi gửi (đúng như code hiện tại,
            `ReservationApprovedProcessor:44-45`): SMTP nhận thành công →
            process chết trước khi commit → retry **gửi email lần hai**.
          - Ghi ledger **trước** khi gửi: commit xong → SMTP lỗi → **mất
            email**, không ai retry.
          - `message_id UNIQUE` chỉ chặn hai **bản ghi ledger**, hoàn toàn
            không chặn **side effect SMTP lặp lại**.
          - `SmtpTicketMailSender` (`:45`) gọi thẳng `mailSender.send(mail)`,
            **không có idempotency key** nào gửi kèm — provider không có cách
            nhận ra đây là lần gửi lặp.
      - [x] Ghi quyết định: **`Chốt: Phương án (B) — delivery ledger trong
        PostgreSQL — người quyết định: Trần Hoàng Long — ngày: 2026-07-28`**
        - Hệ quả đã khoá: **`V15__notification_delivery_ledger.sql` CÓ tồn
          tại**, tạo ở bước 3e (sau V14). Redis chỉ còn giữ lock ngắn hạn.
        - Kéo theo bắt buộc: protocol 3 pha + reconciler (v16), đổi contract
          `TicketMailSender` sang `ACCEPTED`/`RETRYABLE_BEFORE_DATA`/
          `AMBIGUOUS` (v17), gauge `notification_ledger_unknown_current`,
          và SLA reconciliation thủ công cho `UNKNOWN`.
    - [ ] ⛔ **Công bố delivery semantics chính xác** — trong `OPERATIONS.md`
      và tài liệu nghiệm thu. **Không được hứa exactly-once** khi SMTP provider
      không hỗ trợ idempotency key. Nhưng ⛔ **đính chính v16: nói trống
      "at-least-once" cũng SAI** và mâu thuẫn với chính quyết định không-retry
      `UNKNOWN` ở dưới. Câu đúng phải tách hai nhánh:
      - Đường thành công và đường lỗi **trước khi gọi SMTP** (claim lỗi, render
        lỗi, SMTP từ chối rõ ràng): **at-least-once** — message được retry,
        có thể gửi trùng.
      - Đường `UNKNOWN` (đã gọi SMTP, không biết kết quả): **hệ thống KHÔNG tự
        retry** → email **có thể chưa bao giờ được giao**. Đây là lỗ hổng có
        chủ đích, đánh đổi lấy việc không gửi trùng vé.
      - [ ] Vì vậy phải kèm **SLA reconciliation thủ công** cho `UNKNOWN`, ghi
        rõ trong `OPERATIONS.md`: ai trực, tần suất kiểm (khuyến nghị ≤ 1 giờ
        trong ngày diễn ra sự kiện), cách tra log SMTP provider để quyết định
        gửi lại hay không, và audit của quyết định đó. Không có SLA thì
        `UNKNOWN` = email mất im lặng.
      - [ ] Alert bắt buộc — ⛔ **đính chính v17: `notification_ledger_unknown_total
        > 0` là alert SAI.** Đó là counter tích luỹ (`NotificationMetrics` hiện
        toàn `Counter`, Micrometer thêm hậu tố `_total`), nên sẽ **đỏ vĩnh
        viễn** sau khi mọi row `UNKNOWN` đã xử lý xong, và **reset về 0 khi
        restart** dù backlog trong DB vẫn còn — tức vừa không tự tắt, vừa
        không tin được. Phải có **hai** metric, hai alert riêng:
        - **Gauge đọc từ DB** (`notification.ledger.unknown.current`, đăng ký
          bằng `Gauge.builder(...)` trên `COUNT(*) WHERE status = 'UNKNOWN'`):
          alert `notification_ledger_unknown_current > 0` — phát hiện **backlog
          hiện tại**, tự hết khi reconcile xong, sống sót qua restart. Đây là
          alert gắn với SLA ở trên.
        - **Counter sự kiện** (`notification.ledger.unknown`): alert
          `increase(notification_ledger_unknown_total[5m]) > 0` — phát hiện
          `UNKNOWN` **mới phát sinh**, kể cả khi backlog cũ đang được xử lý.
        - Gauge phải đọc DB chứ không đếm trong bộ nhớ, nếu không sẽ lặp lại
          đúng lỗi mất-state-khi-restart.
    - [ ] Ledger phải có **trạng thái tường minh**, không chỉ "có row / không
      có row":
      - `PROCESSING` — đã claim, chưa biết kết quả.
      - `DELIVERED` — SMTP xác nhận nhận, đã commit.
      - `UNKNOWN` / `RECONCILE_REQUIRED` — đã gọi SMTP nhưng không commit được
        kết quả (đúng cửa sổ crash ở trên).
      - Kèm **lịch sử attempt** (số lần, thời điểm, lỗi) để điều tra được.
    - [ ] ⛔ **Protocol bắt buộc (mới, v16) — nếu không chốt cụ thể thì trạng
      thái `UNKNOWN` KHÔNG THỂ tồn tại.** PostgreSQL không có cách nào biết
      SMTP đã nhận email; process chết thì không ai ghi được gì. Nghĩa là
      `UNKNOWN` **không bao giờ do chính worker ghi ra** — nó là kết luận của
      một tiến trình khác. Ba pha, không được gộp:
      - **TX1 (claim)**: `INSERT`/`UPDATE` row về `PROCESSING` kèm
        `attempt_id`, `attempt_no`, `started_at`, `lease_until = now() +
        lease-ttl`, **rồi COMMIT**. Chưa gọi SMTP.
      - **Gửi SMTP — NGOÀI mọi transaction.** Không mở transaction bao quanh
        lời gọi mạng.
      - **TX2 (kết luận)**: `UPDATE ... SET status = 'DELIVERED'` (hoặc
        `FAILED` nếu SMTP từ chối dứt khoát) `WHERE message_id = ? AND
        attempt_id = ?`, rồi COMMIT. Ràng buộc `attempt_id` để một attempt cũ
        đến muộn không ghi đè kết luận của attempt mới.
      - **Reconciler định kỳ**: chuyển mọi row `PROCESSING` có
        `lease_until < now()` sang `UNKNOWN`. Đây là **nguồn duy nhất** sinh
        ra `UNKNOWN`.
      - [ ] SMTP **timeout / connection reset SAU khi đã gửi `DATA`** cũng
        phải kết luận `UNKNOWN` (TX2 ghi thẳng `UNKNOWN`), **không** phải
        `FAILED`: không có cách nào biết provider đã nhận hay chưa. Chỉ lỗi
        **trước** `DATA` (connect fail, auth fail, `5xx` từ chối rõ ràng) mới
        được coi là `FAILED` và cho retry.
      - [ ] Ghi rõ `lease-ttl` (khuyến nghị ≥ 3× SMTP timeout) và chu kỳ chạy
        reconciler; lease quá ngắn sẽ đẻ ra `UNKNOWN` giả cho những lần gửi
        chỉ đang chậm.
    - [ ] ⛔ **Sửa contract của `TicketMailSender` — nếu không, protocol trên
      KHÔNG thi hành được (mới, v17).** Hiện `SmtpTicketMailSender.java:46-47`
      `catch (Exception ex)` rồi gói **tất cả** vào một `IllegalStateException`,
      và `send()` trả `void`. Worker vì thế **không có cách nào** phân biệt:
      - Lỗi **chắc chắn trước `DATA`** → an toàn để retry (`FAILED`).
      - Lỗi **sau `DATA` / không xác định** → bắt buộc `UNKNOWN`.
      Cả hai hiện gộp làm một, nên `ReservationApprovedProcessor:48-50` chỉ
      biết `metrics.failed()` rồi ném lại → RabbitMQ retry **mọi** lỗi, kể cả
      lỗi có thể provider đã nhận email. Đây chính là kịch bản gửi trùng vé mà
      cả H13.1 đang cố tránh.
      - [ ] Đổi contract sang phân loại tường minh — trả về enum hoặc ném
        exception có kiểu:
        - `ACCEPTED` — SMTP xác nhận nhận.
        - `RETRYABLE_BEFORE_DATA` — chứng minh được lỗi xảy ra **trước** khi
          gửi `DATA`: lỗi compose/`MimeMessageHelper`/parse địa chỉ (tức lỗi
          ném ra **trước** dòng `mailSender.send(mail)`), `MailPreparationException`,
          `MailAuthenticationException`, lỗi connect, và `SMTPAddressFailedException`
          ở `RCPT TO`.
        - `AMBIGUOUS` — mọi trường hợp còn lại.
      - [ ] ⛔ **Mặc định phải là `AMBIGUOUS`**: chỉ được xếp vào
        `RETRYABLE_BEFORE_DATA` khi **chứng minh được** bằng danh sách trắng ở
        trên. Cấm `catch (Exception)` rồi đoán. Timeout / connection reset
        trong lúc hoặc sau `DATA` là `AMBIGUOUS` theo định nghĩa.
      - [ ] Cập nhật đồng bộ **cả 4 test** đang dùng `TicketMailSender`
        (`ReservationApprovedProcessorTest`, `SmtpTicketMailSenderTest`,
        `ReservationApprovedMessagingIntegrationTest`,
        `ReservationApprovedRetryCycleIntegrationTest`) — đổi contract sẽ làm
        chúng fail, và `RetryCycleIntegrationTest` là chỗ phải bổ sung ca
        "`AMBIGUOUS` → ghi `UNKNOWN`, KHÔNG requeue".
    - [ ] Nếu provider **có** hỗ trợ idempotency key: gửi kèm `messageId` làm
      key. Đây là cách duy nhất tiến gần exactly-once thật sự; ghi rõ provider
      đang dùng có hỗ trợ hay không.
    - [ ] ⛔ **Trạng thái `UNKNOWN` KHÔNG được tự động gửi lại mù quáng.** Phải
      qua provider lookup (tra message đã gửi chưa) hoặc xử lý thủ công có
      audit. Tự retry `UNKNOWN` = chấp nhận gửi trùng vé cho sinh viên.
    - [ ] **Failpoint test bắt buộc — hai giai đoạn** (⛔ đính chính v16: bản
      trước assert `UNKNOWN` ngay sau khi kill, điều đó **không thể xảy ra** vì
      process đã chết thì không ai ghi được `UNKNOWN`):
      - **Giai đoạn 1**: giết process **ngay sau khi SMTP trả thành công nhưng
        trước khi commit TX2** → assert row bị bỏ lại ở trạng thái
        `PROCESSING` với `lease_until` trong quá khứ (sau khi lease hết hạn).
      - **Giai đoạn 2**: chạy reconciler → assert row chuyển sang `UNKNOWN`,
        và assert hệ thống **không tự gửi lại**.
      - Assert thêm: `attempt_no` **không** tăng, và không có message nào được
        đẩy lại vào queue gửi mail.
    - [ ] ⚠️ **Định nghĩa xử lý backup cũ hơn TTL** — dù chọn (A) hay (B):
      với (A), bản backup cũ hơn **30 ngày** thì marker Redis **đã hết hạn từ
      trước lúc restore**, nên không có gì để khôi phục; phải ghi rõ ngưỡng
      tuổi backup mà quy trình reconcile còn hợp lệ, và cách xử lý khi vượt
      ngưỡng (ví dụ: không requeue gì, chấp nhận mất, thông báo thủ công).
      - ⛔ **Với (B) vấn đề này GIẢM chứ KHÔNG "biến mất"** (đính chính cách
        nói quá ở bản nháp): ledger nằm trong PostgreSQL nên được `pg_dump`
        cuốn theo và không có TTL — nhưng **một bản backup cũ vẫn thiếu ledger
        của những email gửi SAU thời điểm snapshot**. Restore từ backup 3 ngày
        trước thì 3 ngày email cuối không có bằng chứng delivery, y như (A).
        Cái (B) sửa được là **TTL 30 ngày** và **tính nhất quán giữa các
        store**, không phải khoảng trống giữa snapshot và hiện tại.
      - [ ] Vì vậy vẫn cần: ghi rõ RPO chấp nhận được, và quy trình xử lý phần
        dữ liệu nằm sau mốc snapshot (đối chiếu thủ công với log SMTP provider,
        hoặc chấp nhận và thông báo).
    - [ ] **Restore test bắt buộc, hai message**:
      - Message `SENT` nhưng consumer **chưa xử lý** → sau restore phải gửi
        **đúng một lần**.
      - Message `SENT` và **đã gửi thành công** → sau restore **không được gửi
        lại**.
      - Hai ca này chính là thứ phân biệt "reconcile đúng" với "đoán mò"; thiếu
        chúng thì H13 chỉ là quy trình trên giấy.
  - [ ] Viết lại `restore-postgres.sh` theo mô hình trên, hoặc đổi tên nó cho
        đúng phạm vi thật (ví dụ `restore-postgres-into-new-stack.sh`) và cấm
        chạy trực tiếp lên stack production.
  - [ ] Trong lúc chuyển upstream ở bước 5, đặt site vào maintenance **ở edge
        (Caddy)**, không chỉ dừng container app.
  - [ ] Backup hiện chưa bắt buộc: mã hoá, checksum/chữ ký, và bản sao
        off-site. `pg_restore --list` chỉ chứng minh file đọc được — **không**
        thay thế được một lần restore drill thật vào DB tạm.
  - [ ] Lịch drill: ít nhất một lần restore đầy đủ vào stack tạm trước cutover,
        ghi lại thời gian hoàn thành (đây là số RTO thật).

- [ ] **H14. "Break-glass" hiện không cứu được đúng sự cố nó nhắm tới** (mới,
      v15):
  - `OPERATIONS.md` mô tả break-glass là SQL đổi/tạo admin, nhưng admin mới vẫn
    đăng nhập **bằng OTP qua email**. Nếu sự cố là SMTP/provider chết — đúng
    kịch bản đáng sợ nhất, và cũng là thứ H1/H8 cảnh báo — thì đổi email trong
    DB không giúp gì: không ai nhận được OTP.
  - [ ] Cần **một trong hai**, đã test trước khi cutover:
    - SMTP dự phòng (provider thứ hai) cấu hình sẵn + đã gửi thử thành công; hoặc
    - Cơ chế recovery một lần (one-time recovery code phát hành ngoài băng),
      audit nghiêm ngặt, hết hạn ngắn, dùng xong vô hiệu.
  - [ ] Sửa `OPERATIONS.md`: nói rõ SQL đổi email **không** phải break-glass cho
        sự cố SMTP, và trỏ sang quy trình mới.

## Medium

- [ ] **M1. Trusted device: absolute expiry + cleanup KHÔNG phá replay
      detection** — replay detection phụ thuộc row đã revoke còn nằm trong
      bảng (`TrustedDeviceService.exchange`: `findByTokenHash` →
      `revokeIfActive` trả 0 → biết là replay → `revokeAll`). Xóa row revoked
      sớm biến cookie bị đánh cắp thành "token không tồn tại" — mất dấu user
      để thu hồi thiết bị còn lại. Vậy:
  - [ ] ⛔ **Replay cookie cũ có thể DoS các device MỚI** — `exchange()`
        (`TrustedDeviceService.java:56-60`) coi **mọi** `revokeIfActive == 0`
        là replay rồi gọi `revokeAll()`. Sau sign-out-all, kẻ giữ cookie cũ
        replay liên tục sẽ liên tục thu hồi các device vừa đăng ký lại, suốt
        thời gian tombstone còn sống (tới 30 ngày). Nạn nhân không đăng nhập
        yên được.
    - ⛔ **Trường lưu bền vững cho "generation" đã được chốt ở H8 (v15)** —
      M1 **dùng chung** `trusted_devices.device_family_id` +
      `issued_auth_version` của `V14__trusted_device_lineage.sql`. Không dựng
      cơ chế generation thứ hai song song; nháp trước để mở chỗ này nên M1 và
      H8 có nguy cơ thi công lệch nhau.
    - Phân biệt bằng đúng hai cột đó — **ba nhánh, không phải hai**:
      - `issued_auth_version` **==** `users.auth_version` hiện tại → replay của
        thế hệ đang sống (trộm cookie thật) → revoke **đúng family đó, một
        lần, idempotent**. ⛔ KHÔNG `revokeAll()` toàn tài khoản.
      - `issued_auth_version` **<** `users.auth_version` → thế hệ đã bị vô hiệu
        trước đó → chỉ **từ chối và ghi log**, KHÔNG đụng tới device thế hệ
        mới. Đây là ca DoS mô tả ở trên.
      - ⛔ `issued_auth_version` **>** `users.auth_version` → **vi phạm
        invariant**, không bao giờ được xảy ra trong luồng bình thường. Chỉ
        phát sinh do backfill V14 sai, migration lỗi, restore lệch giữa
        `users` và `trusted_devices`, hoặc DB bị sửa tay. Xử lý:
        **từ chối, log mức ERROR, phát metric cảnh báo — TUYỆT ĐỐI không mint
        token.** Không được gộp nhánh này vào `!=` rồi xử lý như thế hệ cũ:
        như vậy sẽ nuốt mất một dấu hiệu dữ liệu hỏng.
      - Viết code theo đúng ba nhánh tường minh (`==` / `<` / `>`), không dùng
        `!=`. Test đủ cả ba.
    - Test: sign-out-all → đăng nhập OTP mới, nhớ thiết bị → replay cookie có
      từ trước sign-out-all → phiên và device mới **vẫn hoạt động**.
  - [ ] KHÔNG xóa row chỉ vì `revoked_at IS NOT NULL`; giữ tombstone đến hết
        `expires_at`.
  - [ ] Cleanup chỉ xóa `expires_at < now`; thêm index trên `expires_at`.
  - [ ] Rotate: successor giữ **absolute expiry của token gốc** (không
        `now + 30d` — `TrustedDeviceService.java:42`), chuỗi refresh chết
        sau 30 ngày kể từ lần verify OTP.
  - [ ] Cookie `TVU_DEVICE` Max-Age = thời gian còn lại, không cố định 30
        ngày (`AuthCookieService.java:28-30`).

- [ ] **M2. Triệt timing side-channel bằng full-enqueue** —
      `AdminOtpService.java:54-73`: email lạ return ngay, email thật chờ SMTP
      đồng bộ. Lưu ý: chỉ async hóa `sendCode()` là CHƯA đủ — email thật vẫn
      tốn thêm lookup user + check budget Redis + tạo/lưu OTP trước khi
      enqueue, đo thống kê nhiều request vẫn phân biệt được. Thiết kế đúng:
  - [ ] Endpoint chỉ normalize email + enqueue cho **mọi** request (hợp lệ
        và không hợp lệ đi cùng một đường), trả 202 ngay.
  - [ ] Worker (bean riêng, bounded executor — không `@Async` cùng class vì
        self-invocation không qua proxy) mới lookup user, rate-limit, tạo
        OTP, gửi mail nếu hợp lệ; metric/log lỗi gửi.
  - [ ] Rate limit theo IP đặt NGOÀI queue để email rác không làm đầy
        executor; queue đầy vẫn trả response chung nhưng phát metric/alert.

- [ ] **M3. Revoke phiên khi xóa organizer / deactivate club** — ⚠️ phần
      deactivate club đã **nâng lên H7**: revoke phiên hiện tại là CẦN nhưng
      KHÔNG ĐỦ, phải chặn cả đăng nhập mới. Mục này chỉ còn phần thu hồi phiên.
      `lockOrganizer` (`AdminManagementService.java:165-173`) đã đúng chuẩn:
  - [ ] ⚠️ **Viết lại theo cơ chế `auth_version` của H8** — mọi mục dưới đây
        mô tả theo Redis marker cũ, phải chuyển sang bump version trong DB:
    - `lockOrganizer`: bump `auth_version` trong **cùng transaction** với
      `organizer.lock()`.
    - `deactivateClub` (`:91-96`): bulk-bump `auth_version` cho **mọi**
      organizer thuộc club, trong cùng transaction với `club.deactivate()`.
    - sign-out-all (H5): bump `auth_version` trong DB, không phải set marker
      Redis.
    - `deleteOrganizer` (`:176-180`): validator phải từ chối vì **user không
      còn tồn tại** (projection không tìm thấy row) — không dựa vào một marker
      Redis nằm ngoài transaction. Trusted devices vẫn tự xóa qua FK
      `ON DELETE CASCADE` (V11:5).
    - `trustedDeviceService.revokeAll()` **giữ đúng ba luồng**: sign-out-all,
      lock organizer, deactivate club. Ở ba chỗ đó nó vẫn cần thiết vì chặn
      đường refresh bằng device cookie, độc lập với JWT.
    - ⛔ **Đính chính v15**: bản trước ghi "giữ ở **mọi chỗ đang có**" —
      **SAI**. `exchange()` hiện cũng gọi `revokeAll()` ở nhánh replay
      (`TrustedDeviceService.java:56-60`); giữ nguyên chỗ đó chính là bug DoS
      của M1 (cookie cũ replay liên tục đá văng mọi thiết bị mới). Phải **gỡ
      `revokeAll()` khỏi nhánh replay của `exchange()`**, thay bằng quy tắc ba
      nhánh `issued_auth_version` ở M1.
    - Phạm vi revoke của mọi đường: xem **bảng chốt duy nhất ở H8**. M3 không
      được định nghĩa lại phạm vi.
    - ⛔ Nếu vẫn gọi Redis revoke riêng bên cạnh: transaction DB rollback vẫn
      để lại revocation ngoài transaction → trạng thái lệch (user không bị
      khóa nhưng phiên đã chết). Bump version trong DB thì rollback cuốn theo
      cả hai.

- [ ] **M6. CSP production đang chặn chính tài nguyên frontend dùng** —
      `backend/infra/production/Caddyfile:16`:
  - `style-src 'self' 'unsafe-inline'` và `font-src 'self' data:` nhưng
    `index.html:15-23` tải Google Fonts (`fonts.googleapis.com`,
    `fonts.gstatic.com`) → font bị chặn, trang rơi về font hệ thống.
  - `img-src 'self' data:` nhưng `EventForm.tsx:43` mặc định bannerUrl là
    `https://images.unsplash.com/...` → banner mặc định của mọi sự kiện mới bị
    chặn.
  - [ ] Font: chọn một hướng và làm dứt điểm — **self-host** (khuyến nghị,
        giữ CSP chặt và không phụ thuộc bên thứ ba) HOẶC allowlist đúng
        `fonts.googleapis.com` + `fonts.gstatic.com`.
  - [ ] ⛔ **Banner không chỉ bị CSP chặn — nó chưa hoạt động end-to-end.**
        Chuỗi đứt ở nhiều chỗ:
    - `EventForm.tsx:43` nhận `bannerUrl` (mặc định ảnh Unsplash);
    - nhưng `eventService.toEventRequest()` (`:65-76`) **không gửi** trường
      này lên API;
    - backend không có `banner` ở DTO/entity/DB;
    - và khi đọc event thật, `eventService.ts:53` luôn gán `bannerUrl: ""`.
    Nghĩa là người dùng nhập banner xong thì giá trị bị vứt đi lặng lẽ.
  - [ ] Chốt một trong hai, đừng để lửng lơ:
    - **(a)** Bỏ hẳn input banner, dùng placeholder self-hosted — nhanh, khớp
      với việc dọn nội dung giả ở C2.
    - **(b)** Làm đủ: migration DB, request/response DTO, storage/upload,
      validate URL, và mở CSP tương ứng.

- [ ] **M5. Ghi nhận bằng chứng SHA production đang chạy** — chưa ai xác định
      được production thật sự chạy commit nào, nên mọi kết luận trong file này
      mới chỉ chắc chắn đúng cho nhánh `hlow`:
  - Trạng thái đo được 2026-07-28: `origin/main` = `8cef2d78`, `hlow` =
    `31622c33` — `hlow` **hơn `main` 25 commit** (main là ancestor của hlow,
    `git rev-list --left-right --count` = `0  25`). Riêng thư mục
    `auth/` đã lệch 12 file.
  - Chưa có run nào của workflow `Deploy production`, cũng chưa có bản ghi nào
    trong Deployments API → nhiều khả năng deploy thủ công trên VPS.
  - [ ] Ghi vào `PRODUCTION_DEPLOYMENT_VI.md`: SHA thật lấy bằng
        `git rev-parse HEAD` **trên VPS**, thời điểm deploy, backup ID, kết
        quả smoke test, và SHA đó có thuộc `origin/main` không
        (`git merge-base --is-ancestor <sha> origin/main`).
  - [ ] Sau khi có SHA thật: đối chiếu lại các file:line trong checklist này.
        Số dòng đang trích theo `hlow`; bản chất lỗi đã kiểm là vẫn tồn tại
        trên `main` (đã spot-check `AuthApplicationService`, pattern demo-gate
        của frontend), nhưng vị trí dòng sẽ lệch.

- [ ] **M4. Migration test V9-có-dữ-liệu → V10** — regression test cho
      tương lai (staging/import dữ liệu vào prod), KHÔNG phải gate cho lần
      deploy DB trống:
  - [ ] Testcontainers: Flyway target V9 → seed admin có `ext_subject` →
        migrate hết → assert `ext_subject IS NULL`, `auth_method =
        'EMAIL_OTP'`, partial index hoạt động.

- [ ] **M7. Frontend tự refresh session khi chính login/OTP thất bại** (mới,
      v15):
  - `apiClient.ts:76-86` thử `tryRefreshSession()` trên **mọi** 401, chỉ trừ
    đúng `/auth/session/refresh`. `authService.loginWithCredential()` (`:64-70`)
    gọi `apiRequest` mà **không** truyền `retryOnAuthFailure=false`. Hệ quả:
    nhập sai OTP hoặc Microsoft token hỏng → FE gọi refresh rồi **gửi lại
    request auth lần hai**, làm nhiễu rate limit và log đăng nhập sai.
  - [ ] Loại trừ toàn bộ endpoint auth công khai + logout khỏi đường retry
        (allowlist theo path, không chỉ chặn `/auth/session/refresh`).
  - [ ] Test: "OTP sai chỉ gọi `verify` đúng một lần và không gọi refresh".

- [ ] **M8. DB chưa bảo vệ invariant theo role** (mới, v15):
  - `V1__init_auth_schema.sql:10-26` mới chỉ CHECK giá trị enum. Chưa chặn:
    `ORGANIZER` không có club; sinh viên/super admin mang `club_id`;
    `mssv_status = VERIFIED` nhưng `mssv IS NULL`; organizer/admin mang `mssv`
    và `class_code`.
  - Kèm lỗ hổng ở tầng code: `AdminManagementService.verifyMssv()` (`:127-136`)
    chỉ kiểm `mssv` khác rỗng, **không kiểm `role == SINH_VIEN`** — admin có
    thể verify MSSV cho một organizer.
  - [ ] Thêm guard trong code + CHECK constraint. ⛔ **Bắt buộc gộp vào chính
        `V13__users_auth_identity_constraint.sql` của H3, làm CÙNG LÚC với H3**
        (xem C3.-1) — không phải "nếu tiện", và không phải một migration riêng
        sau đó: tách ra thì phải preflight dữ liệu cũ hai lần và V13 có thể pass
        rồi migration sau fail giữa chừng trên production.
  - [ ] ⛔ Không sửa V1 đã phát hành — Flyway checksum mismatch chặn khởi động.
  - [ ] Nếu C3.0 chốt Phương án 2, phải preflight dữ liệu cũ trước khi thêm
        CHECK (cùng lý do như H3).

- [ ] **M9. Rate limit chưa phủ session refresh, và không sống qua restart**
      (mới, v15):
  - `SensitiveFlowRateLimitFilter` (`:45-55`) chỉ phủ POST tới
    `/api/auth/login`, `/api/auth/otp/request`, `/api/auth/otp/verify`,
    `/api/reservations`. **Thiếu `/api/auth/session/refresh`** — chính endpoint
    đổi device cookie lấy JWT.
  - Limiter in-memory: reset sạch mỗi lần restart container và không chia sẻ
    được nếu chạy nhiều instance.
  - [ ] Thêm `/api/auth/session/refresh` vào danh sách.
  - [ ] Chuyển sang token bucket trên Redis, hoặc đẩy rate limit ra edge
        (Caddy). Ghi rõ lựa chọn nào được chốt.

- [ ] **M10. `audit_log.detail` được ghép JSON bằng nối chuỗi** (mới, v15):
  - `AdminManagementService.java:69`, `:86`, `:152` và
    `TicketReservationService.java:141`, `TicketingService.java:154` đều nối
    tay `"{\"name\":\"" + club.getName() + "\"}"`. Tên CLB và email là dữ liệu
    người dùng nhập; một dấu `"` làm hỏng JSON, chuỗi khéo léo hơn thì **chèn
    được field giả vào audit record** (audit spoofing).
  - Chưa thấy XSS vì FE render dạng text — nhưng audit log là bằng chứng, làm
    sai lệch được nó là đủ nghiêm trọng.
  - [ ] Dùng `ObjectMapper.writeValueAsString(Map.of(...))` (đã có bean sẵn
        trong `TicketReservationService`) cho mọi chỗ dựng `detail`.
  - [ ] Test: tạo CLB tên `a"},"role":"SUPER_ADMIN` → assert `detail` parse ra
        đúng một field `name` với giá trị nguyên văn.

- [ ] **M11. Blind spot trong CI** (mới, v15):
  - `ci.yml:143` — `npm audit --audit-level=high || true` là **fail-open**: có
    CVE cũng xanh.
  - `dorny/paths-filter@v3` (`:19`) quyết định job backend/frontend có chạy
    không; thay đổi chỉ chạm workflow/script có thể làm **cả hai job bị skip**
    mà gate vẫn xanh (đúng loại "green giả" đã dính ở EPIC 5/EPIC UI).
  - Chưa có image scan / SBOM / signing cho image đem deploy.
  - Actions mới pin theo major tag (liên quan H10).
  - Actionlint báo 2 lỗi SC2086 ở `ci.yml:68-78` (biến `$reports` chưa quote).
  - [ ] Bỏ `|| true`; nếu cần chấp nhận CVE thì dùng allowlist tường minh.
  - [ ] Đảm bảo `ci-gate` coi job **skipped ngoài dự kiến là fail** (đã có luật
        ở C1 — kiểm lại nó phủ đúng ca paths-filter).
  - [ ] Thêm Trivy image scan + SBOM vào CI; pin action bằng SHA.
  - [ ] Sửa 2 SC2086.

- [ ] **M12. Node lệch ba nơi** (mới, v15):
  - `frontend/Dockerfile:1` = Node **24** (đây là thứ dựng image production),
    `ci.yml:121` = Node **22**, máy dev hiện tại = Node **26**. Không có
    `.nvmrc`, `package.json` không khai báo `engines`.
  - Đo được: chạy trên Node 22 thì lint/test/build xanh; chạy trên Node 26 thì
    **10 test hỏng vì `localStorage` không tồn tại** (trùng ghi nhận cũ trong
    memory về vitest/localStorage). Nghĩa là gate xanh ở CI **không** chứng
    minh được artifact Docker (Node 24) đúng.
  - [ ] Pin **cùng một major** ở cả bốn: `Dockerfile`, `ci.yml`, `engines`,
        `.nvmrc`. Rồi chạy lại gate.
  - [ ] Riêng nhóm test phụ thuộc `localStorage`: sửa để chạy được trên mọi
        major (khai báo môi trường jsdom rõ ràng), đừng để nó thành lý do khoá
        cứng một phiên bản Node.

- [ ] **M13. Observability production chưa đủ để phát hiện sự cố** (mới, v15):
  - Chưa có Prometheus/Grafana/Alertmanager thực tế, và chưa có alert cho:
    SMTP hỏng, tỉ lệ OTP thất bại, outbox `FAILED`, DLQ có message, tuổi bản
    backup, dung lượng đĩa, hạn chứng chỉ, đăng nhập sai bất thường, container
    restart lặp.
  - Log hiện chỉ giữ ~30 MB/container (`compose.yaml:24-28`, `max-size 10m` ×
    `max-file 3`) — không đủ để điều tra một sự cố phát hiện muộn.
  - [ ] Tối thiểu trước cutover: alert cho **SMTP down** (vì nó khoá đường đăng
        nhập admin — xem H1/H14) và **DLQ khác rỗng**.
  - [ ] Tăng retention log, hoặc ship log ra ngoài host.

- [x] ✅ **M14. Tài liệu quan trọng chưa được Git theo dõi** (mới, v15 — **XONG
      2026-07-28**):
  - Checklist này cùng `DEPLOY_EXTRAS_VI.md`, `DEPLOY_LOW_COST_VI.md`,
    `VPS_SETUP_VI.md`, `docs/MOCK_DATA_REMOVAL_SURVEY_VI.md` đang **untracked**
    → không xuất hiện trong PR nào, không có lịch sử, mất nếu clone lại.
  - ⛔ ~~`docs/MOCK_DATA_REMOVAL_SURVEY_VI.md` nằm sai chỗ, phải chuyển vào
    `backend/docs/`~~ — **ĐÍNH CHÍNH v17, yêu cầu này SAI, đã huỷ.** `docs/` ở
    root không phải chỗ tạm: nó đang giữ tài liệu frontend/xuyên suốt và **đã
    được Git track** (`docs/FRONTEND_IMPLEMENTATION_STATUS.md`,
    `docs/PROJECT_CLOSEOUT.md`). Survey này có tiêu đề "Khảo sát gỡ dữ liệu ảo
    khỏi **frontend**" nên `docs/` mới là đúng quy ước; chuyển sang
    `backend/docs/` là **tạo** lệch chuẩn. Giữ nguyên đường dẫn, không đổi
    tham chiếu ở C2/C3.
  - [x] ✅ **XONG 2026-07-28** — commit cả năm file lên `hlow`, giữ nguyên vị
        trí từng file.

## Low

- [ ] **L1. Metadata protected-resource tự sinh quảng cáo sai khả năng mTLS**
      (mới, v15):
  - Production trả về tại `GET https://evts.id.vn/.well-known/oauth-protected-resource`:
    ```json
    {
      "resource": "https://evts.id.vn",
      "bearer_methods_supported": ["header"],
      "tls_client_certificate_bound_access_tokens": true
    }
    ```
    Hệ thống **không** xác thực certificate-bound access token (RFC 8705), nên
    claim này sai sự thật với mọi client đọc metadata để quyết định cách gắn
    token.
  - Nguồn gốc (đã kiểm chứng trong JAR, không phải suy đoán):
    - `WellKnownController` **không** sinh endpoint này — nó chỉ có
      `/.well-known/jwks.json` và `/.well-known/openid-configuration`.
    - Cũng **không** phải metadata của Microsoft Entra: field `resource` trả về
      chính `evts.id.vn`, do `OAuth2ProtectedResourceMetadataFilter
      .resolveResourceIdentifier(request)` dựng từ URL của request.
    - Filter nằm sẵn trong `spring-security-oauth2-resource-server-7.0.6.jar`
      (chính artifact ở `monolith/pom.xml:15`), **không** cần
      `spring-authorization-server`. Hằng số
      `DEFAULT_OAUTH2_PROTECTED_RESOURCE_METADATA_ENDPOINT_URI` =
      `/.well-known/oauth-protected-resource` + `/**`; giá trị mặc định được
      hardcode trong filter: `.bearerMethod("header")` và
      `.tlsClientCertificateBoundAccessTokens(true)`.
    - `OAuth2ResourceServerConfigurer.configure()` (spring-security-config
      **7.0.6**, `:304-310`) đăng ký filter này **vô điều kiện** bằng
      `addFilterBefore(..., AbstractPreAuthenticatedProcessingFilter.class)`.
      Ta bật `.oauth2ResourceServer(...)` tại `SecurityConfig.java:63` → tự
      động có endpoint.
    - Vì filter đứng **trước** authorization filter nên endpoint trả lời công
      khai, dù chain khai báo `.anyRequest().authenticated()`.
  - Mức **Low**, không nâng: đây là sai lệch metadata / protocol correctness,
    **không** phải đường bypass xác thực. Xếp sau toàn bộ C/H/M.
  - [ ] Sửa bằng customizer trong `SecurityConfig.java:63`:
    ```java
    .oauth2ResourceServer(oauth2 -> oauth2
            .protectedResourceMetadata(metadata -> metadata
                    .protectedResourceMetadataCustomizer(builder ->
                            builder.tlsClientCertificateBoundAccessTokens(false)))
            .bearerTokenResolver(bearerTokenResolver())
            .jwt(jwt -> jwt
                    .decoder(jwtDecoder)
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())))
    ```
  - [ ] Hoặc — nếu dự án không muốn công bố metadata này chút nào — chặn hẳn
        đường dẫn ở Caddy (`Caddyfile:27` đang `handle /.well-known/*` proxy
        tất cả; thu hẹp thành allowlist đúng `jwks.json` +
        `openid-configuration`). Chọn một, ghi rõ lựa chọn.
  - [ ] Test: `GET /.well-known/oauth-protected-resource` → assert
        `tls_client_certificate_bound_access_tokens` là `false` (phương án 1)
        hoặc 404 (phương án 2).
  - ⚠️ Đính chính nhỏ: bản nháp L1 dẫn spring-security-config **7.0.4** — đó
    chỉ là sources jar cũ còn sót trong `~/.m2`. `mvn dependency:tree` xác nhận
    dự án resolve **7.0.6** cho toàn bộ nhóm spring-security (config,
    oauth2-resource-server, oauth2-jose, core, web). Kết luận L1 không đổi, chỉ
    sửa số phiên bản dẫn chứng.
  - ⚠️ Bài học ghi lại để không lặp: **có mặt trong classpath ≠ có khai báo
    trong `pom.xml`**. Vòng review trước đã kết luận sai ("metadata của Entra")
    chỉ vì `grep spring-authorization-server` không ra kết quả, mà không mở
    JAR `spring-security-oauth2-resource-server` để xem filter nào được tự
    đăng ký. Với Spring Security, phải đọc `*Configurer.configure()`.

## Đã xem xét và LOẠI (không fix)

| Finding gốc | Lý do loại |
|---|---|
| Preflight cho `REPLACE_WITH_SMTP_CREDENTIAL` lọt | Sai — `common.sh:42` chặn mọi giá trị chứa `REPLACE_WITH`; `deploy.sh:8` luôn chạy preflight |
| V10 "xóa vĩnh viễn ext_subject" = Critical | Prod deploy đầu trên DB trống — V10 chạy trên bảng `users` rỗng; bootstrap tạo super admin EMAIL_OTP mới. Backup mapping/tách 2 giai đoạn chỉ cần nếu sau này áp V10 lên DB đã có admin Entra (import dev/staging) |
| `rollback.sh` không rollback Flyway/DB | Giới hạn vận hành có chủ đích, usage message nói rõ + tự backup verified trước rollback |
| OTP demo `123456` | Chủ đích dev-only: `FixedOtpCodeIssuer` `@Profile({"dev","test"})`, `ProductionSecretsValidator` chặn config demo ở prod, adminclb chỉ có trong DB dev |
| H4 phương án "cho phép trùng email" | Loại sau phân tích — xem H4 |
| Logout gọi `revokeAll()` (đề xuất v1) | Loại — xem H5, thay bằng thiết kế hai tầng |
| "Đưa `/api/auth/logout` vào permitAll là đủ cho JWT hết hạn" (kết luận v3) | SAI — bearer resolver + `BearerTokenAuthenticationFilter` chặn 401 trước bước authorization. Xem H5, cần thêm resolver trả `null` |
| "Resolver trả `null` cho toàn bộ `/api/auth/**`" (cách diễn đạt v4) | SAI — namespace chứa `GET /api/auth/me`, `PATCH /api/auth/me`, `PATCH /api/auth/me/profile` và sign-out-all, đều cần JWT. Xem H5, dùng allowlist 5 cặp method+path |
| Mail health làm container unhealthy liên tục (Docker gọi `/actuator/health` mỗi 30s) | Trade-off đã ghi rõ ở H1, nhóm chấp nhận có chủ đích: SMTP là đường đăng nhập admin duy nhất, phát hiện sớm quan trọng hơn cờ healthy đẹp |
| "Xóa revocation key khi mint thành công" (đề xuất v5) | SAI — làm token đã revoke sống lại ngay khi user đăng nhập lại, sign-out-all mất tác dụng. `mint()` còn chạy ở `updateProfile`/`updateDisplayName`/refresh, không chỗ nào kiểm lại điều kiện. Xem H8 — phương án cuối là `users.auth_version` trong PostgreSQL (không phải `session_issued_at_ms`, thứ đó cũng đã bị loại ở dòng dưới) |
| "Coi mọi job skipped là đạt" ở `ci-gate` (đề xuất v5) | SAI — fail-open, job skip ngoài dự kiến lặng lẽ thành pass. Xem C1, luật theo từng job |
| `revokedBefore` so theo timestamp, kể cả mili-giây (đề xuất v6) | Loại — mint và revoke vẫn có thể trùng đúng một mili-giây: `<=` từ chối nhầm token mới, `<` cho lọt token cũ. Xem H8, dùng session epoch (so bằng/khác, không phụ thuộc đồng hồ) |
| "Kiểm tra lại ngay trước khi mint" là đủ để chặn lock/deactivate (v6) | Loại — check và mint không nguyên tử với thao tác lock. Xem H7, cần row lock hoặc `auth_version` tăng trong cùng transaction |
| Session epoch chỉ nằm trong Redis, key hết hạn = reset về 0 (đề xuất v7) | Loại — DB và Redis không commit nguyên tử (DB khóa xong, Redis INCR lỗi = token cũ vẫn sống); TTL reset version giết nhầm token hợp lệ mint gần cuối cửa sổ; đổi JWT TTL có thể làm token epoch 0 sống lại. Xem H8, DB là nguồn sự thật |
| Cho `AuthApplicationService.login()` dùng chung predicate admin (gợi ý v7) | SAI — sau H3, Microsoft chỉ dành cho `SINH_VIEN` còn predicate admin chỉ nhận `SUPER_ADMIN`/`ORGANIZER`, tái dùng sẽ khóa toàn bộ đăng nhập sinh viên. Xem H7 |

## Thứ tự fix đề xuất

0. **Chốt C3.0 (clean slate vs data migration) — việc đầu tiên, không có
   ngoại lệ.** Đây là quyết định xóa dữ liệu không hoàn tác được và nó quyết
   định H3/V13 viết theo hướng nào. Chưa điền ô đó thì không bắt đầu H3.
0b. **Thiết kế C3 ngay từ đầu** (không thực thi) — quy trình clean-slate phải
   có sẵn trước khi bắt tay sửa code, vì nó quyết định **V12–V14** chạy trên DB
   nào (rỗng hay có dữ liệu thật) và cutover ra sao. Riêng V14 còn phụ thuộc
   trực tiếp: có dữ liệu thật thì phải backfill + revoke device cũ (xem H8).
1. C1 (cấu hình GitHub + triage CodeQL #5) — chặn rủi ro lớn nhất
1b. **C2** — gỡ mock khỏi đồ thị runtime FE + cấu hình demo khỏi JAR. Độc lập
   với nhóm auth, kiểm chứng được ngay bằng bundle, nên làm sớm.
2. **H1 nhịp 1 — chỉ phần cấu hình + docs** (health mail, checklist nghiệm
   thu, gửi OTP thật tới bootstrap mailbox). ⛔ **KHÔNG đánh dấu H1 hoàn tất ở
   bước này** — điều kiện đóng H1 là H14 đã rehearsal xong ở bước 4b. Đến lúc
   đó mới quay lại tick H1.
⛔ **Ràng buộc bao trùm bước 3–5: migration phải được TẠO đúng thứ tự số.**
   C3.-1 yêu cầu tuyệt đối V12 → V13 → V14. Bản nháp v15 lại xếp H8/M1 (tạo
   **V12 và V14**) ở bước 3, còn H3/M8 (tạo **V13**) ở bước 5 — tức V14 tồn tại
   trước V13. Bất kỳ DB dev/staging nào đã chạy V14 rồi mới nhận V13 sẽ khiến
   Flyway `validate` báo *"Detected resolved migration not applied to
   database"* và **chặn khởi động ứng dụng**. Hiện chưa gây thiệt hại vì repo
   mới có V1–V11, nhưng phải sửa trình tự trước khi bắt tay. Vì vậy **H8 tách
   làm hai pha**:

3. **H8 pha 1 — `auth_version` → tạo `V12__users_auth_version.sql`.** Chỉ cột
   + logic bump/validate version. Chưa đụng trusted-device lineage.
3b. **H3 + M8 → tạo `V13__users_auth_identity_constraint.sql`** (xem C3.-1:
   identity + role/profile invariant gộp làm một). ⛔ Phải xong **trước** V14.
3c. **H8 pha 2 (lineage) + M1 → tạo `V14__trusted_device_lineage.sql`**, kèm
   đủ 5 bước nâng cấp bảng đang có dữ liệu (nullable → backfill family →
   revoke device cũ → điền version → `SET NOT NULL` + partial unique index).
3e. **H13.1 nếu chốt phương án (B) → tạo `V15__notification_delivery_ledger.sql`.**
   Phải sau V14 để giữ đúng thứ tự số. ⛔ Quyết định (A)/(B) của H13.1 phải
   chốt **trước bước 3**, vì nó quyết định có V15 hay không — chốt muộn thì
   phải chèn số vào giữa.
3d. Sau khi cả V12–V14 đã tồn tại đúng thứ tự số: **H7 → H5 → H9**
   (v6 ghi H7 trước H8 là mâu thuẫn với chính nội dung H8 — đã sửa):
   - **H8 là nền** (đã làm ở 3/3c): `auth_version` + lineage là hạ tầng cho cả
     ba mục sau. H7 cần nó để "reactivate → login lại" chạy được; H5 cần nó để
     sign-out-all không tự làm hỏng lần đăng nhập kế tiếp, **và** cần
     `device_family_id` cho `revokeActiveInFamily()`.
   - **H7 kế**: policy + chống race, tăng `auth_version` trong cùng transaction
     với lock/deactivate (dùng chính hạ tầng của H8).
   - **H5 kế**: logout/sign-out-all đứng trên cả hai.
   - **H9 sau cùng** — dùng chính `auth_version` của H8; làm trước H8 thì
     revoke sẽ chặn oan token vừa mint ở `updateProfile`.
   - Chạy chung một bộ integration test cho cả nhóm khi xong, không test rời.
   - GitNexus `impact` trước (chạy tại chỗ, đọc số lúc chạy — đừng chép số cũ
     vào đây): `InternalJwtService.mint()` mức **CRITICAL** vì H8 đổi shape
     JWT nên phải rà mọi nơi đọc claim; `SessionMinter.mint()` cũng
     **CRITICAL**; `activeAdmin()` công cụ chấm thấp nhưng **vẫn phải review
     tay** vì nằm trên đường xác thực; `revokeAll()`; `submit()` (H9).
4. H2, H6 (code auth độc lập với nhóm trên)
4b. **H11 → H12 → H10 → H13 → H14** (nhóm hạ tầng, chạy song song được với
   nhóm auth vì không đụng code Java):
   - H11 (tách Postgres runtime user) và H12 (frontend non-root) đổi
     `compose.yaml`/`Dockerfile`/`Caddyfile` → phải smoke lại full stack.
   - H10 (immutable artifact) làm **sau** H11/H12, vì hai mục kia còn đổi
     Dockerfile; pin digest trước sẽ phải pin lại.
   - H13 (restore) và H14 (break-glass SMTP) phải xong **trước cutover** —
     đây là hai đường thoát hiểm, không phải tính năng.
   - ⚠️ **H13.1 tách khỏi H13 về thời điểm**: quyết định (A)/(B) chốt trước
     bước 3; nếu (B) thì code + V15 làm ở **3e**, còn phần quy trình restore
     blue-green vẫn ở 4b. H13 **không được coi là xong** khi chưa có restore
     test hai message (SENT-chưa-xử-lý và SENT-đã-gửi).
   - ⚠️ **H14 xong + rehearsal thành công → quay lại đánh dấu H1 HOÀN TẤT**
     (nhịp 2 của H1, xem bước 2). H14 cũng là điều kiện tiên quyết để deploy
     H8, vì H8 làm mọi JWT cũ mất hiệu lực.
5. **H4** (đụng schema — làm sau khi H5 ổn định; H4 sửa cả
   `GlobalExceptionHandler` nên chạy lại toàn bộ test 409 hiện có).
   - ⛔ **H3 + M8 KHÔNG còn ở bước này** — đã chuyển lên **3b** vì V13 bắt buộc
     phải có trước V14. Bản nháp v15 để H3/M8 ở bước 5 chính là nguồn của lỗi
     out-of-order.
6. **M1–M14** (v10 chỉ ghi M1–M4, v14 mở rộng tới M6, v15 thêm M7–M14):
   - **M12 (pin Node) phải xong TRƯỚC bước 7** — chưa pin thì kết quả gate
     không nói lên điều gì về artifact thật.
   - **M14 (commit tài liệu) làm ngay**, rẻ và chặn mất mát.
   - ⛔ **M8 KHÔNG nằm ở bước này** — đã chuyển lên **bước 3b**, làm chung
     migration V13 với H3 (xem C3.-1).
   - ⛔ **M1 KHÔNG nằm ở bước này** — làm chung với **H8 pha 2 ở bước 3c**: cả
     hai dùng chung `V14__trusted_device_lineage.sql`, tách ra sẽ thi công lệch
     nhau.
6b. **L1** — làm cuối, sau toàn bộ C/H/M. Chỉ sửa metadata, không chặn deploy.
   Tiện thì gộp vào cùng PR với M6/M5 (nhóm chạm cấu hình edge + bằng chứng
   production), vì cả ba đều cần verify lại bằng request thật tới `evts.id.vn`.
   - **M6 phải xong TRƯỚC** khi dựng bundle production cuối — nó đổi
     font/banner/CSP, tức đổi chính artifact đem đi deploy.
   - **M5 là điều kiện bắt buộc TRƯỚC cutover** — chưa xác minh được SHA thật
     đang chạy trên VPS thì không có mốc rollback đáng tin.
7. Gate cuối — **trạng thái đo 2026-07-28 (cập nhật v15)**: phần *chạy test*
   đã XANH, nhưng gate tổng thể vẫn **ĐỎ** vì **các mục implementation bắt
   buộc chưa hoàn thành** — toàn bộ C1–C3, H1–H14 và M1–M14. (Bản nháp v15 chỉ
   liệt kê C1–C3/H1–H14, bỏ sót nhóm M dù chính đầu tài liệu xác nhận M cũng
   chưa làm.)
   - **L1 KHÔNG chặn deploy** — sai lệch metadata, ghi riêng làm việc dọn sau
     cutover. Đây là mục duy nhất trong file được miễn khỏi gate.
   - ⚠️ **Xuất xứ số liệu**: ba dòng dưới lấy từ báo cáo review v15, **chưa
     được chạy lại độc lập khi soạn bản này**. Trước khi dùng làm bằng chứng
     nghiệm thu phải chạy lại và dán output — đây đúng là chỗ dự án từng dính
     "green giả" bốn lần (EPIC 5, EPIC UI, EPIC 7, và chính con số cũ ngay
     dưới đây).
   - [x] `mvn -B -pl monolith -am clean verify` với Docker **bật**:
         **249/249 pass, 0 fail, 0 error, 0 skipped**. (Con số cũ "4 error, 58
         skipped / 247 test" là kết quả đo khi Docker daemon không chạy —
         Testcontainers im lặng bỏ qua. Đã đo lại, số cũ **không còn đúng**.)
   - [ ] QR: một lần decode fail trong một lần chạy full suite cũ; sau đó **12
         lần chạy riêng + một lần full suite nữa đều pass**. Vẫn xếp là
         **flaky chưa truy nguyên**, chưa đủ bằng chứng gọi là bug sản phẩm.
         Giữ ô trống cho tới khi tìm ra nguyên nhân.
   - [x] Frontend trên **Node 22**: `npm run lint` sạch, **69/69 test pass**,
         `npm run build:production` pass, `npm audit` **0 vulnerability**.
         ⚠️ Kết quả này **chỉ đúng với Node 22** — xem M12, artifact production
         build bằng Node 24 và máy dev đang Node 26 (10 test hỏng). Chưa pin
         Node thì ô này **không chứng minh được artifact thật**.
   - [ ] ⛔ **Thống nhất major version của Node ở ba nơi** — hiện lệch nhau
         nên gate "xanh" không chứng minh được artifact thật:
         `frontend/Dockerfile:1` dùng `node:24-alpine` (đây là thứ build ra
         image production), còn `ci.yml:121` và checklist đều ghi Node 22.
         Pin cùng một major cho CI + Dockerfile + toolchain local (thêm
         `engines` / `.nvmrc`), rồi chạy lại gate.
   - [ ] ShellCheck + Actionlint + GitNexus `detect_changes`.
   - [ ] Smoke trên docker compose local.
   - [ ] Rehearsal đầy đủ trên staging/stack mới (C3) rồi mới chuyển
         `evts.id.vn` — không thử nghiệm trực tiếp trên tên miền đang phục vụ.
8. **Thực thi C3 — THEO ĐÚNG NHÁNH ĐÃ CHỐT Ở C3.0**, chỉ trong maintenance
   window cuối cùng, SAU khi toàn bộ gate ở bước 7 đã xanh trên stack staging
   mới.
   - ⛔ **ĐÍNH CHÍNH v15 — bước này TRƯỚC ĐÂY GHI "Thực thi C3 clean-slate" vô
     điều kiện.** Đó là lỗi nguy hiểm nhất trong file: nếu C3.0 chốt **Phương
     án 2 (Data migration)** mà người triển khai vẫn làm theo câu đó, **toàn bộ
     dữ liệu production bị bỏ lại** trên stack cũ và hệ thống lên sóng với DB
     rỗng — một mất mát không hoàn tác được, gây ra bởi chính runbook.
   - [ ] **Nếu C3.0 = Phương án 1 (Clean slate)**: dựng DB v2 rỗng, migrate tới
         latest, bootstrap admin. ⛔ Điều kiện bắt buộc: **bằng chứng kiểm kê
         đã lưu** (9 bảng + queue/DLQ + Redis, xem C3.0) chứng minh toàn bộ dữ
         liệu hiện có chỉ là dữ liệu thử — lưu **trước** cutover, không phải
         sau.
   - [ ] **Nếu C3.0 = Phương án 2 (Data migration)**: KHÔNG dựng DB rỗng. Thay
         bằng **restore/import dữ liệu production đã rehearsal**, chạy preflight
         sửa dữ liệu vi phạm CHECK, rồi migrate tới latest. Nghiệm thu bằng đối
         chiếu số lượng row với bản kiểm kê trước cutover.
   - [ ] ⛔ **Ngay sau khi điền C3.0, XÓA nhánh không được chọn khỏi runbook.**
         Để cả hai nhánh song song trong tài liệu vận hành là mời gọi đúng tai
         nạn mô tả ở trên. Checklist này giữ cả hai vì là tài liệu kế hoạch;
         runbook đem vào maintenance window thì chỉ được có một.
   - Cutover xong mới `stop` stack cũ (**giữ volume**), và chỉ xóa sau khi hết
     thời gian lưu giữ rollback.
