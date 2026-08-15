# Publish job: master roadmap (2026-08-11)

Kế hoạch đầy đủ, một chỗ duy nhất, cho toàn bộ phần còn lại của publish job. Viết ra vì đêm nay đã đi
"đến đâu hay đến đó" — plan riêng cho từng mảnh nhỏ mà không có bức tranh tổng. Tài liệu này là bức
tranh tổng: 4 phase, mỗi phase chia task cụ thể, có đánh dấu đã xong/chưa, có ghi rõ độ phức tạp thật
(không giấu bớt để nghe nhẹ nhàng hơn).

**Tình trạng thật khi viết tài liệu này**: đã đi hết Phase 0 (5 collector + 3 writer + ký/xác minh
attestation) và một nửa Phase 1. Phase 1 phần còn lại **lớn hơn dự kiến ban đầu nhiều** — khi đọc kỹ
`normalizedScanContent`/`sbomDocumentContent`, phát hiện các collector đã build (slice 1-3) **chưa đủ
trường** để build đúng lookup này (thiếu `policy`, `counts` theo severity, `declaredOutcome`,
`reportDigest`, `canonicalDigest`/`canonicalSize`) — nghĩa là phải quay lại mở rộng chính các collector
đã "xong" trước khi có thể đọc lại chúng đúng cách. Ghi rõ ra đây, không giấu.

---

## Phase 0 — ĐÃ XONG HOÀN TOÀN

- [x] 5 collector: SBOM, vulnerability scan, secret scan (layer + filesystem), Flyway inventory,
      frontend config fingerprint
- [x] `oci-push.py` — client push OCI thô (vì oras/crane không dùng được)
- [x] `evidence-set-envelope.py` — ghép + đẩy evidence-set manifest thật
- [x] `marker-envelope.py` — đẩy marker thật
- [x] Template ký attestation trong CI (`actions/attest-build-provenance`, comment sẵn trong `ci.yml`)
- [x] `attest-verify.py` — xác minh attestation qua `gh attestation verify` (nhánh "chữ ký hợp lệ" chưa
      test được với chữ ký thật — sẽ tự xác nhận lần CI thật đầu tiên)
- [x] `oci-read.py` — `fetch_manifest`, `fetch_blob`, `read_object_lookup` (đọc thô, đúng thứ tự
      size-trước-hash bắt buộc)
- [x] `marker-lookup.py` — `read_marker_lookup` (dùng cho 2/10 lookup: `finalMarker`, `preparedMarker`)

**14 file code + test, tất cả real TDD, tất cả đã merge vào `ci/ghcr-publish`, CI xanh (trừ 2 mutation
survivor đã biết và chấp nhận).**

---

## Phase 1 — evidenceSetLookup (ĐANG LÀM, còn 6 task)

Dùng cho 2/10 lookup còn thiếu: `monolithEvidenceSet`, `frontendEvidenceSet`.

### 1.1 Mở rộng 3 collector scan để sinh đủ trường `normalizedScanContent` cần
**Chưa bắt đầu.** `collect-vulnerability-scan.py`/`collect-secret-scan.py` hiện chỉ sinh
`{scanner, target, timestamp, findings, truncated}` — thiếu `policy` (severityThreshold), `counts`
(tổng hợp theo severity × fixAvailable, không chỉ đếm theo `findings` đã bị cắt), `declaredOutcome`
(pass/fail collector tự tính), `reportDigest`. Cần đọc lại `scanPolicy`/`scanCounts`/`finding` $defs đầy
đủ trước khi sửa. **Việc này sửa lại 3 file đã merge, không phải viết mới — cần plan riêng.**

### 1.2 Mở rộng SBOM collector để sinh `canonicalDigest`/`canonicalSize`
**Chưa bắt đầu.** `collect-sbom.py` hiện thiếu 2 trường này (digest/size của chính document SPDX đã
canonical hoá). Nhỏ hơn 1.1, có thể gộp cùng plan.

### 1.3 Điều tra thật hành vi phân trang/trùng lặp của `gh attestation verify`
**Chưa bắt đầu, và có rủi ro thật**: đêm nay đã thử 4 artifact công khai khác nhau, không tìm được cái
nào có attestation đọc được với token hiện có (scope: gist/read:org/repo/workflow, không có packages).
Nếu không tìm được cách test thật, sẽ phải làm như `attest-verify.py` đã làm — viết theo tài liệu chính
thức của `gh`, đánh dấu rõ "chưa xác minh với chữ ký thật", xác nhận ở lần CI thật đầu tiên.

### 1.4 Đọc report (fetch descriptor từ evidence-set carrier's layers + verify + build normalizedReport)
**Chưa bắt đầu.** Phụ thuộc 1.1/1.2 xong trước (cần biết chính xác normalizedReport sinh ra thế nào từ
output collector đã mở rộng).

### 1.5 Đọc attestation (verify + pagination + duplicates)
**Chưa bắt đầu.** Phụ thuộc 1.3.

### 1.6 Ghép 1.4 + 1.5 thành `read_evidence_set_lookup`
**Chưa bắt đầu.** Phụ thuộc 1.4, 1.5 xong.

---

## Phase 2 — Ráp orchestration cuối (CHƯA BẮT ĐẦU, 4 task)

Phụ thuộc toàn bộ Phase 1 xong (cần đủ cả 10 lookup mới ráp được observation thật).

### 2.1 Xây khối `expected` (sourceRepository, repositories, frontendConfigFingerprint, signerWorkflow,
registry)
Đơn giản — hầu hết là hằng số + 1 lần gọi `collect-frontend-config-fingerprint.py` đã có.

### 2.2 Ráp 10 lookup + `expected` thành 1 observation JSON hoàn chỉnh
Gọi lần lượt: 4× `read_object_lookup`, 2× `read_marker_lookup`, 2× `read_evidence_set_lookup`, cộng
`commit`/`environment`.

### 2.3 Gọi `publish-decision.sh` với observation thật, đọc kết quả
Đã có sẵn `publish-decision.sh` (CI-verified từ 3a/3b) — chỉ cần gọi đúng cách
(`bash publish-decision.sh <script_dir> <observation_json>`).

### 2.4 Xử lý kết quả: COMPLETE → push candidate thật + evidence-set thật + prepared marker → gọi lại
decision → nếu vẫn COMPLETE → promote tag + final marker. Không COMPLETE ở bất kỳ bước nào → dừng,
không publish gì.
Đây là vòng lặp thật của design doc §4's 8 bước — phức tạp nhất về logic điều khiển (không phải về công
nghệ), vì phải xử lý đúng thứ tự ghi (candidate → evidence-set → prepared marker → decide → final) và
dừng đúng chỗ nếu bất kỳ bước nào fail.

---

## Phase 3 — Nối vào CI thật, chạm GHCR thật lần đầu (CHƯA BẮT ĐẦU, 4 task)

**Đây là ranh giới đã nói trước: mọi thứ Phase 0-2 đều test được bằng registry tạm cục bộ. Phase 3 là
lần đầu tiên có thật với `ghcr.io` production.**

### 3.1 Thêm job `publish` thật vào `ci.yml` (hiện chỉ có comment template)
Cần: `permissions: {contents: read, packages: write, id-token: write, attestations: write}`,
`needs: [backend, frontend, lint]`, `if: push to main`.

### 3.2 Nối bước build → push candidate image thật
### 3.3 Nối bước ký attestation thật (`actions/attest-build-provenance`) cho từng artifact
### 3.4 Chạy CI thật lần đầu, đọc log, xác nhận toàn bộ chuỗi hoạt động đúng với GHCR thật (không phải
registry tạm) — đây là lúc các phần "chưa xác minh với chữ ký thật" (1.3, `attest-verify.py`'s
`attestationVerified: True` branch) mới thật sự được chứng minh.

**Rủi ro thật của Phase 3**: đây là nơi mọi giả định chưa test được (bearer-auth thật của GHCR,
attestation thật, pagination thật) đồng loạt gặp thực tế lần đầu — nhiều khả năng cần vài vòng sửa lỗi
thật (giống mọi phase trước, nhưng lần này không thể test cục bộ trước, phải sửa-đẩy-xem-log).

---

## Phase 4 — Đưa vào sản xuất (CHƯA BẮT ĐẦU, 2 task)

### 4.1 Đổi `deploy.sh`/`deploy-production.yml` sang pull image đã verify từ GHCR thay vì build trên VPS
### 4.2 Đưa PR #23 khỏi draft, merge vào `main`

---

## Tổng số task còn lại: **16** (6 Phase 1 + 4 Phase 2 + 4 Phase 3 + 2 Phase 4)

Đã xong: **8 khối lớn** (Phase 0, đã liệt kê ở trên, ~14 file).

## Điểm cần bạn quyết định dọc đường (không tự ý quyết):
- Cuối Phase 2: có thật sự muốn Phase 3 chạy được không (đụng GHCR thật) hay dừng ở "logic đã đúng,
  test đầy đủ bằng registry tạm" — vì Phase 3 là chạm production thật.
- Cuối Phase 3: merge PR #23 vào `main` (Phase 4.2) — hành động chia sẻ, cần xác nhận thời điểm.
