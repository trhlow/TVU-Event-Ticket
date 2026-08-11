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

**Tự sửa lỗi ngay trong đêm viết tài liệu này:** bản đầu tiên chọn syft+grype+gitleaks+docker
export/save như công cụ "còn mở để chọn". Sai — `.github/contracts/predicates/vulnerabilityScan.schema.json`,
`.../layerSecretScan.schema.json`, `.../filesystemSecretScan.schema.json`, và
`evidence-verification-contract-design.md` §7 (dòng 302, 313-343) đã **đóng băng sẵn**: Trivy cho cả
vulnerability scan lẫn hai loại secret scan, `crane export`/`crane blob` cho extraction, cộng một bảng
byte-cap/timeout đầy đủ. Phát hiện được vì đọc lại predicate schema trước khi viết plan, đúng kỷ luật
"đọc code/spec thật trước khi tin giả định" đã dùng suốt đêm cho 3a/3b — không phải một lựa chọn kiến
trúc còn mở, sửa lại ở §3.2/§3.3/§3.3a bên dưới. syft cho SBOM vẫn giữ nguyên (không bị spec pin tên
tool, chỉ pin định dạng SPDX v2.3). Đã cài đúng bộ công cụ cục bộ (syft 1.51.0, Trivy 0.73.0,
go-containerregistry/crane 0.21.9 qua scoop) để có thể build+test thật thay vì đoán hành vi output.

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

### 3.2 Vulnerability scan — Trivy, KHÔNG phải grype

**Sửa lại so với bản đầu của tài liệu này** (viết trước khi đọc kỹ `.github/contracts/predicates/
vulnerabilityScan.schema.json` và `evidence-verification-contract-design.md` §7): công cụ đã bị spec
**cố định**, không phải lựa chọn còn mở. Bằng chứng, đọc trực tiếp từ code đã có:

- `vulnerabilityScan.schema.json`'s mô tả: "vulnerability scanning uses Trivy's own DB, not a
  repo-tracked ruleset".
- `evidence-verification-contract-design.md:302`: "Trivy vulnerability DB chỉ phục vụ vulnerability
  scanning".
- `evidence-verification-contract-design.md:271`: `fixAvailable` phải suy từ **`FixedVersion` của
  Trivy** — một field đặt tên theo đúng Trivy's JSON output shape, không phải suy luận chung.

Dùng `trivy image --format json <image>` (hoặc `trivy image --input <tarball>` để ăn đúng byte đã build,
theo nguyên tắc §3.0), field `vulnerabilityDb.{identity,digest,updatedAt}` đọc từ Trivy's DB metadata
(`trivy image --format json` bao gồm `Metadata.DBUpdatedAt` trong output nếu bật; xác nhận version chính
xác ở task đầu tiên chạy thật, không đoán trước). `findings[].fixAvailable` = `FixedVersion` non-empty.

### 3.3 Secret scan — Trivy `fs --scanners secret`, extraction bằng `crane`, KHÔNG phải gitleaks/docker

**Cùng lỗi, cùng chỗ sửa.** `evidence-verification-contract-design.md` §7 (dòng 313-329) đã đóng băng cả
tool lẫn cách extract, không để collector tự chọn:

| | Công cụ extract | Whiteout | Quét bằng |
|---|---|---|---|
| `filesystemSecretScan` (flatten) | `crane export <image> -` (version + digest pinned) | **áp dụng** | `trivy fs --scanners secret` trên cây đã giải nén |
| `layerSecretScan` (per-layer) | `crane blob <image>@<layer-digest>` từng layer riêng | **bỏ qua có chủ đích** | `trivy fs --scanners secret` trên từng layer, gộp kết quả |

`crane` không phải `docker export`/`docker save`: `crane export` ghi thẳng ra tarball rootfs đã áp dụng
whiteout mà không cần daemon chạy container thật (nhanh hơn, không cần quyền tạo container). `crane blob`
lấy đúng blob nén của một layer theo digest, không unpack layer khác — đúng nghĩa "extract riêng".

`ruleset.{version,digest}` phải là version+digest của **một file được Git track** trong repo (không phải
config mặc định của Trivy) — mirror luật "policy phải từ file Git track, không phải workflow input" đã
áp dụng ở mục 6 của master spec. Cần tạo file ruleset đó (Trivy hỗ trợ custom secret rules qua
`--secret-config`); nội dung cụ thể là việc của task viết `collect-secret-scans.sh`, không phải của tài
liệu thiết kế này.

### 3.3a Giới hạn byte và timeout — đã pin sẵn trong spec, không phải chọn

Bảng cap đầy đủ nằm ở `evidence-verification-contract-design.md:331-343`, phải copy nguyên vào code khi
viết `collect-secret-scans.sh`/`collect-sbom-vuln.sh`, không diễn giải lại: report blob 8 MiB, carrier/
marker manifest 64 KiB, marker payload 256 KiB, một layer blob (compressed) khi per-layer scan 2 GiB,
tổng layer compressed một image 8 GiB, tổng bytes sau giải nén 24 GiB, số file sau giải nén 2 000 000,
timeout mỗi lần extract+scan 20 phút, `findings` tối đa 100 mục rồi `truncated: true`. Descriptor khai
vượt cap ⇒ CONFLICT, không tải. Vượt cap **trong lúc** giải nén ⇒ CONFLICT, dừng ngay. Mỗi lần extract
phải dọn đĩa trong `trap`/`finally` kể cả khi fail.

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

1. `collect-sbom-vuln.sh` (syft cho SBOM, Trivy cho vulnerability scan) — test cục bộ với image build
   sẵn, không cần GHCR.
2. `collect-secret-scans.sh` (crane export/blob để extract, Trivy `fs --scanners secret` để quét,
   layer+filesystem) — cùng cách.
3. `collect-flyway-inventory.sh` (Postgres tạm) — cùng cách, tái dùng pattern Testcontainers.
4. Ráp observation.json từ 3 script trên + validate bằng `observation.schema.json` — hoàn toàn local.
5. Publish job thật (push GHCR, cần `permissions: packages: write` chạy trong CI) — chỉ sau khi 1-4 đã
   xanh độc lập.
