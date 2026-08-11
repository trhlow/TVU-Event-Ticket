# Collector và publish job: thiết kế

## Ghi chú về cách bản thiết kế này ra đời

`brainstorming` skill đòi hỏi đối thoại từng câu hỏi một với người dùng trước khi chốt thiết kế. Người
dùng đã đi ngủ và uỷ quyền tường minh (2026-08-11) cho việc "hoàn thành tất cả việc còn lại" bao gồm cả
việc tự thiết kế collector/publish job mà không cần hỏi lại. Hai điều đó xung đột: không có ai để hỏi
từng câu một. Bản thiết kế này vì vậy được viết **một chiều** — tôi tự chọn phương án dựa trên phán đoán
tốt nhất cho một đồ án capstone (công cụ miễn phí, quen thuộc, ít secret nhất có thể), ghi rõ lý do từng
quyết định, và đánh dấu toàn bộ tài liệu là **CHỜ NGƯỜI DÙNG DUYỆT LẠI** khi thức dậy trước khi bất kỳ
quyết định kiến trúc nào ở đây được xem là chốt cứng. Việc triển khai (xem plan đi kèm) chỉ bắt đầu ở
phần không cần secret thật và hoàn toàn có thể quay lại nếu người dùng muốn đổi hướng.

## 1. Phạm vi

Hai mảnh còn thiếu của pipeline release-gate, cả hai đã CI-verified xong ở `publish-decision.sh`:

- **Collector**: sau khi build image `monolith`/`frontend`, gom đủ bằng chứng (SBOM, 3 loại scan,
  Flyway inventory, OCI digest/size thật) thành một `observation.json` đúng
  `.github/contracts/observation.schema.json`.
- **Publish job**: đưa `observation.json` đó vào `publish-decision.sh`; nếu quyết định là `COMPLETE`,
  thật sự đẩy image + evidence set + marker lên GHCR theo đúng trình tự prepared → final mà
  `publish-decision.sh` đã giả định (state machine COMPLETE/PARTIAL/CONFLICT/UNKNOWN đọc 10 lookup:
  `finalMarker`, `preparedMarker`, `{monolith,frontend}{Tag,DigestObject,Candidate,EvidenceSet}` — xem
  `LOOKUP_REPOSITORY` trong `publish-decision.sh:124-135`).

Không nằm trong phạm vi đêm nay (theo dõi ở mục 7 "Việc để lại"):

- Đổi `deploy.sh`/`deploy-production.yml` sang pull từ GHCR — cần collector/publish job chạy thật trên
  `main` trước, không thể làm song song mà không có gì để pull.
- Merge PR #23 vào `main` — cùng lý do, cộng thêm đây là hành động ảnh hưởng chia sẻ mà tôi tự thấy nên
  chờ xác nhận rõ ràng thay vì làm âm thầm dù đã được uỷ quyền rộng.

## 2. Ba GHCR repository, khớp `LOOKUP_REPOSITORY`

`publish-decision.sh` đã cố định 3 tên logic: `release`, `monolith`, `frontend`. Ánh xạ sang GHCR:

| Tên logic | GHCR package | Nội dung |
|---|---|---|
| `release` | `ghcr.io/trhlow/tvu-event-ticket/release` | `preparedMarker`/`finalMarker` — OCI artifact JSON (không phải image chạy được) |
| `monolith` | `ghcr.io/trhlow/tvu-event-ticket/monolith` | Image thật + tag `evidence-monolith-sha-<sha>` cho evidence set |
| `frontend` | `ghcr.io/trhlow/tvu-event-ticket/frontend` | Image thật + tag `evidence-frontend-sha-<sha>` cho evidence set |

`GITHUB_TOKEN` mặc định của Actions có quyền `packages: write` khi job tự khai trong `permissions:` —
không cần Personal Access Token. `ci.yml` đã để sẵn bình luận nói đúng điều này ở dòng 11-13, viết từ
trước khi collector/publish job tồn tại. Không cần OIDC/cosign cho việc đẩy artifact — cosign chỉ cần
nếu sau này muốn *ký* thêm ngoài cơ chế digest/size binding mà `publish-decision.sh` đã tự làm (§5.7,
invariant 4, xác nhận đã cài đêm nay). Quyết định: **không thêm cosign đêm nay** — digest+size binding
cộng `sha256(canonical_bytes(...))` đã là cơ chế chống giả mạo tự thân, thêm cosign là một lớp ký khoá
riêng cho một thứ hệ thống đã tự chứng minh bằng toán, không phải một lỗ hổng đang mở.

## 3. Collector: thứ tự và công cụ

### 3.0 Nguyên tắc: byte đã build mới là byte được publish

`ci.yml` đã có sẵn nguyên tắc này ở job `frontend` (bình luận dòng 201-207: verify một bundle, ship một
bundle khác là đúng thứ H10 tồn tại để chặn). Áp dụng lại: collector **không rebuild** image.
`backend`/`frontend` job hiện tại đã `docker build -t tvu/monolith:ci .` / `tvu/frontend:ci` làm smoke
test và vứt đi. Sửa hai job đó để `docker save | gzip` thành file, `actions/upload-artifact` lên; job
`publish` (job mới, `needs: [backend, frontend]`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`)
tải lại đúng hai tarball đó bằng `docker load`. Digest quét evidence là digest của chính image đã chạy
qua toàn bộ test suite, không phải một bản build lại có thể lệch.

### 3.1 SBOM — syft, SPDX v2.3

`envelope.py`'s `PREDICATE_TYPES["sbom"]` đã cố định `https://spdx.dev/Document/v2.3` — syft xuất thẳng
định dạng này (`syft <image> -o spdx-json`), không cần chuyển đổi. Chạy trên cả hai image.

### 3.2 Vulnerability scan — grype, ăn thẳng SBOM của syft

`grype sbom:<sbom-file>` thay vì `grype <image>` — không kéo lại image lần hai, và bảo đảm scan đúng
những package mà SBOM đã liệt kê (hai bước lệch nhau là đúng thứ digest/size binding của §5.7 tồn tại
để chặn ở tầng envelope; áp dụng cùng kỷ luật ở tầng nội dung). Output JSON của grype được bọc trong
predicate tuỳ biến `https://evts.id.vn/attestations/vulnerabilityScan/v1` (đã có trong `PREDICATE_TYPES`
và `.github/contracts/predicates/vulnerabilityScan.schema.json`).

### 3.3 Secret scan — gitleaks, hai lượt khác nhau (§5's phân biệt layer/filesystem)

Spec (`evidence-verification-contract-design.md:315-316`) đã tách rõ: `layerSecretScan` quét **từng
layer riêng** (bắt secret bị xoá ở layer sau nhưng vẫn nằm trong image); `filesystemSecretScan` quét
**rootfs đã flatten**. Hai công cụ khác nhau cho hai việc:

- **filesystemSecretScan**: `docker create` container tạm từ image → `docker export` → `gitleaks detect
  --source <rootfs>` trên rootfs đã giải nén.
- **layerSecretScan**: `docker save` đã có tarball layer riêng (`manifest.json` liệt kê từng
  `<layer-digest>/layer.tar`); giải nén **từng layer riêng**, chạy gitleaks trên mỗi layer, gộp kết quả.
  Đây là bước duy nhất không có sẵn tool đóng gói — cần một script nhỏ lặp qua layer list.

Cùng một tool (gitleaks) cho cả hai để giảm số công cụ phải bảo trì trong một đồ án capstone; khác nhau
ở **input** đưa vào, không phải ở engine quét.

### 3.4 Flyway inventory — chỉ monolith, đọc từ Postgres thật đã chạy migration

Schema (`observation.schema.json:329`) nói rõ: đọc từ `flyway_schema_history` trong một Postgres tạm
**sau khi** candidate monolith image đã chạy migration lên đó — không đọc từ script trong image, không
đọc từ source tree. Repo đã có pattern này (Testcontainers Postgres dùng cho test backend); collector
dùng cùng cách: khởi một Postgres tạm (container), chạy monolith image trỏ vào đó với flag chỉ-migrate
(nếu có) hoặc khởi full rồi đợi migration xong, đọc bảng, tính lại `checksum` (`sha256` của canonical
migration list — không tin giá trị nào Flyway tự ghi ngoài từng hàng thô).

### 3.5 OCI digest/size — không đoán, đọc từ registry thật

`ociEnvelope` trong observation phải là digest/size **thật của bytes đã đẩy lên**, không phải tính toán
cục bộ trước khi push — vì digest/size binding (§5.7) so sánh đúng cặp này với `sha256(canonical_bytes(content))`.
Trình tự bắt buộc của collector khi đọc lại một artifact nó vừa đẩy (mục "Thứ tự bắt buộc ở collector",
spec dòng 128-135): kiểm `size` trước → tải bytes → băm → đối chiếu `digest` → chỉ khi cả hai khớp mới
parse JSON. Đây là quy tắc cho **decision** khi đọc OCI carrier nói chung; collector áp dụng lại y hệt
khi tự đọc lại thứ mình vừa push để tự kiểm trước khi khai `digestVerified`/`sizeVerified`.

## 4. Publish job: trình tự prepared → evidence set → final

Đọc `publish-decision.sh`'s state machine ngược lại để suy ra trình tự ghi (decision là READ-only,
không bao giờ ghi gì — đây là điều publish job phải tự suy luận, không có trong decision code):

1. Build xong (job `backend`/`frontend`, artifact tarball).
2. Collector chạy trên artifact, tạo observation nháp **chưa có OCI phần push** (chưa thể — chưa push).
3. Push **candidate** tag của từng image lên GHCR (`monolith:candidate-<sha>`, `frontend:candidate-<sha>`).
   Đọc lại digest/size thật (§3.5) → điền vào observation.
4. Push **evidence set** (`evidence-{monolith,frontend}-sha-<sha>`) chứa SBOM + 3 scan + digest binding
   của evidence set carrier chính nó.
5. Ghi **prepared marker** (tag `release:prepared-<sha>`) — observation đầy đủ trừ phần chỉ final marker
   mới có.
6. Gọi `publish-decision.sh` với observation hiện tại (đọc lại toàn bộ 10 lookup từ GHCR thật, không
   dùng bản nháp bước 2-5 — decision phải đọc đúng thứ đang nằm trên registry, không tin bộ nhớ của job).
7. Nếu `COMPLETE`: promote tag (`monolith:latest`/`frontend:latest`, hoặc scheme tag đang dùng ở
   production), ghi **final marker** (`release:final-<sha>` hoặc tương đương), publish job kết thúc
   thành công.
8. Nếu `PARTIAL`/`CONFLICT`/`UNKNOWN`: publish job **fail** — không có gì được coi là production-ready.
   Không tự retry trong cùng lần chạy (retry-queue semantics, nếu cần, là một cơ chế riêng đã có trong
   `publish-decision.sh` cho các trường hợp khác, không phải việc publish job tự phát minh lại).

## 5. Chuỗi CI mới trong `.github/workflows/ci.yml`

- `backend`/`frontend` job hiện tại: thêm bước `docker save | gzip` + `actions/upload-artifact` sau bước
  build image hiện có (dòng 191-192, 288 tương ứng). Không đổi gì khác trong hai job này.
- Job `publish` mới: `needs: [backend, frontend, lint]`, `if:` chỉ chạy trên push vào `main` (không chạy
  trên PR — image chưa merge không nên lên GHCR), `permissions: packages: write` (job-level, không phải
  workflow-level, đúng nguyên tắc least-privilege đã ghi trong comment hiện có).

## 6. Việc KHÔNG làm đêm nay và lý do

- **Không thêm cosign** (§2) — digest/size binding đã tự chứng minh, thêm lớp ký là mở rộng phạm vi
  ngoài yêu cầu.
- **Không đổi `deploy.sh` tối nay trong cùng commit** — tách thành bước riêng sau khi publish job chạy
  thật ít nhất một lần trên `main` và có ảnh thật để pull; đổi cả hai cùng lúc mà không verify được là
  đặt cược kép.
- **Không merge PR #23 tự động đêm nay** — hành động ảnh hưởng `main`/production, tôi chọn dừng lại xin
  xác nhận rõ ràng dù phạm vi tự động đã được mở rộng, vì đây là loại hành động "khó đảo ngược, ảnh
  hưởng trạng thái chia sẻ" mà hướng dẫn đứng của tôi luôn liệt là đáng cân nhắc dừng.

## 7. Việc để lại cho plan tiếp theo (`writing-plans`)

Vì đây là kiến trúc lớn chưa từng có dòng code nào, thực thi theo đúng nhịp SDD đã dùng cho 3a/3b: chia
nhỏ theo phần **không cần secret/registry thật trước**, phần cần push GHCR thật sau khi phần trước đã
CI-verified độc lập:

1. `collect-sbom-vuln.sh` (syft+grype) — test cục bộ với image build sẵn, không cần GHCR.
2. `collect-secret-scans.sh` (gitleaks layer+filesystem) — cùng cách.
3. `collect-flyway-inventory.sh` (Postgres tạm) — cùng cách, tái dùng pattern Testcontainers.
4. Ráp observation.json từ 3 script trên + validate bằng `observation.schema.json` — hoàn toàn local.
5. Publish job thật (push GHCR, cần `permissions: packages: write` chạy trong CI) — chỉ sau khi 1-4 đã
   xanh độc lập.
