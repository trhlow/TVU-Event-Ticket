# Evidence verification contract — mục 3b

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3b của Contract v1 (PR A — GHCR publish).

Viết **cùng lúc** với 3a (`2026-07-30-release-manifest-contract-design.md`) để 3a không chọn shape chặn
đường 3b. **Triển khai sau khi 3a xanh.**

Ba điều khoản của cùng release gate:

- 3a **không** được dùng để tuyên bố evidence đã đáng tin.
- **Không merge và không enable job publish khi chỉ có 3a.**
- **Collector (mục 5) không được bắt đầu trước khi schema 3b đóng băng.**

## 1. Lỗ đang có

`markerContent.evidence.<kind>.<image>` mang `digest`, `subjectDigest`, `predicateType`, `passed`. Cả bốn
nằm **trong** `content`, tức là bên trong tài liệu do producer viết. `passed: true` vì thế là marker tự
khai, và nó va thẳng vào bất biến của hợp đồng:

> Collector xác minh; decision chỉ quyết định từ kết quả đã xác minh. Không tài liệu nào tự khẳng định
> mình đáng tin.

`marker_problems` hiện chỉ kiểm *tính nhất quán nội bộ* của các trường đó (`subjectDigest` phải khớp image
nó được filed dưới, `predicateType` non-empty, `passed` phải true). Không có phép kiểm nào đi ra ngoài
marker để hỏi xem attestation đó có thật, có được ký, và có nói cùng một điều hay không. Một marker khai
tám lần `passed: true` mà chưa từng có scan nào chạy sẽ đi qua toàn bộ 3a.

Năm câu chưa được trả lời, và 3b tồn tại để trả lời chúng:

1. `evidence.*.digest` là digest của cái gì?
2. Evidence được lưu ở đâu?
3. Collector tìm nó bằng gì?
4. Collector kiểm chữ ký, subject, predicate và kết quả scan thế nào?
5. Một evidence artifact bị xoá thì sao?

## 2. Quyết định còn mở: evidence có được push thành OCI blob hay không

Đây là fork duy nhất còn mở của 3b. **3a không phụ thuộc vào kết quả** — 3a chỉ cần biết
`evidenceVerification` treo ngoài `content` trên `presentMarker`.

**Phương án A (khuyến nghị) — push report thành OCI blob, và đóng vòng bằng hai đường độc lập.**

- Workflow ghi report ra bytes canonical, push **blob** đó vào cùng repository.
- `evidence.<kind>.<image>.digest` = digest của blob đó. Rehash được, độc lập, không phụ thuộc API nào
  trả bytes ổn định.
- `actions/attest` tạo attestation với `subject` = **digest của image**, `predicateType` = URI đã pin, và
  predicate **chứa** `reportDigest` bằng chính digest blob trên.
- Collector đóng vòng: fetch blob theo digest → rehash → khớp `evidence.*.digest`; verify attestation trên
  image digest với predicate type đã pin → đọc `predicate.reportDigest` → phải bằng cùng digest đó.

Không có bước nào phải đoán canonical form của bytes mà người khác serialize.

Giá: thêm 8 object mỗi commit (4 kind × 2 image), và chúng cần lifecycle riêng — `cleanupDebt` trong
decision hiện chỉ tính candidate, nên 3b phải nói rõ evidence blob nằm trong hay ngoài khái niệm đó.

**Phương án B — chỉ dùng GitHub Attestations, không blob.**

Ít object hơn, nhưng `evidence.*.digest` mất nghĩa "bytes rehash được": bundle do API trả không bảo đảm
byte-stable giữa hai lần gọi, nên digest trở thành một field không ai kiểm lại được. Đúng loại field mà
`flywayInventory.checksum` đã bị bắt phải recompute chứ không được phép chỉ có mặt.

Tôi đề xuất A. Nếu chọn B thì `evidence.*.digest` phải bị **bỏ khỏi** contract chứ không giữ lại như một
field trang trí.

## 3. `evidenceVerification`, ngoài `content`

Treo trên `presentMarker`, cạnh `verification` và `ociEnvelope`, **không** ở trong `content`. Tám entry:
4 kind × 2 image, mỗi entry:

| Trường | Nghĩa |
|---|---|
| `found` | attestation định vị được. `false` (đã hỏi xong, không có) ⇒ CONFLICT |
| `bundleVerified` | chữ ký và cert identity kiểm xong và đạt |
| `signerRepository`, `signerWorkflow` | đối chiếu `expected` — cùng lối như marker provenance |
| `subjectDigest` | subject của attestation; phải bằng digest của image nó được filed dưới |
| `predicateType` | phải bằng URI đã pin cho kind đó |
| `reportDigestMatched` | blob rehash == `evidence.*.digest` == `predicate.reportDigest` (phương án A) |
| `outcomePassed` | verdict đọc từ **predicate đã verify**, không đọc từ marker |

### Điều làm `passed` không còn là tự khai

`content.evidence.<kind>.<image>.passed` giữ nguyên trong payload, nhưng đổi vai: nó trở thành một **lời
khai phải khớp** `evidenceVerification.<kind>.<image>.outcomePassed`. Hai giá trị lệch nhau ⇒ CONFLICT.

Đó là chỗ self-assertion bị đóng: quyết định đến từ `outcomePassed` (kết quả collector verify), và trường
trong marker chỉ còn là một điều có thể bị bắt nói sai.

### Vì sao không gộp vào `verification.policyPassed`

Phương án "định nghĩa `policyPassed` là AND của tám phép kiểm" bị chính câu mà schema đã viết cho
`evidence` phủ định:

> "Four separate results, because they answer different questions. A single overall pass hides which of
> them was never run."

Tám phép xác minh sau một boolean thì `policyPassed: false` không nói được cái nào chưa từng chạy — và
"chưa từng chạy" là thứ hợp đồng này tồn tại để bắt. `policyPassed` giữ nghĩa hiện tại: policy của
attestation phủ lên **marker**, không phải tổng kết evidence.

## 4. Ba schema custom predicate

`.github/contracts/predicates/{vulnerabilityScan,layerSecretScan,filesystemSecretScan}.schema.json`, mỗi
file là schema của predicate mà workflow phát hành dưới URI `evts.id.vn` tương ứng.

Bắt buộc trong cả ba:

- `scanner`: `{ name, version, vulnerabilityDbUpdatedAt }` — một kết quả scan không nói được nó dùng DB
  nào thì không so sánh được giữa hai lần chạy.
- `target`: `{ imageDigest }` — phải khớp subject của attestation.
- `reportDigest` — khớp blob (§2 phương án A).
- `policy`: ngưỡng đã áp (ví dụ `severityThreshold`, danh sách ignore và digest của file ignore).
- `findings`: đếm theo severity, và danh sách rút gọn đủ để tái lập verdict.
- `passed`: verdict.

Luật quan trọng, cùng lối với `flywayInventory.checksum`: **`passed` phải được collector tái lập từ
`findings` và `policy`, không được tin như một field.** Một verdict nobody derives là một field, và một
field thì copy được từ lần chạy khác. `passed` khai true nhưng `findings` có mục ở/trên ngưỡng ⇒ CONFLICT.

Timestamp được phép ở đây (khác payload marker ở 3a): predicate không phải là thứ bị re-tag, nên nó không
mang ràng buộc "tạo một lần, digest bất biến".

## 5. Ma trận

| Tình huống | Kết quả |
|---|---|
| tất cả 8 entry `found && bundleVerified && reportDigestMatched && outcomePassed`, và khớp `content` | tiếp tục |
| `found: false` (đã hỏi xong, evidence bị xoá hoặc chưa từng có) | CONFLICT |
| `bundleVerified: false`, sai signer, sai subject, sai predicate type | CONFLICT |
| `reportDigestMatched: false` | CONFLICT |
| `outcomePassed: false` | CONFLICT |
| `outcomePassed` lệch `content.evidence.*.passed` | CONFLICT |
| `passed` không tái lập được từ `findings`/`policy` | CONFLICT |
| thiếu entry, thiếu field, sai kiểu ở `evidenceVerification` (collector-derived) | UNKNOWN |
| timeout / 5xx / verifier crash khi verify evidence | UNKNOWN, khai qua `status: "error"` của lookup |

Cùng luật §4 của 3a: kết luận âm đã hoàn tất ⇒ CONFLICT; không hoàn tất được ⇒ UNKNOWN. Collector
**không** được biến mọi exit code khác 0 của `gh attestation verify` thành `found: false` hay
`bundleVerified: false`.

## 6. Test

Mở rộng `manifest-agreement.test.sh` (không tạo file thứ ba) và thêm fixture cho từng hàng CONFLICT ở §5 —
mỗi hàng một fixture, mỗi fixture phải chứng minh đỏ được.

Hai witness bắt buộc, vì chúng là lý do 3b tồn tại:

1. Một observation với marker khai đủ tám `passed: true` nhưng `evidenceVerification` cho thấy một entry
   `found: false` ⇒ CONFLICT. Đây là fixture chứng minh self-assertion đã bị đóng.
2. Một observation với `outcomePassed: true` mà `findings` chứa mục ở/trên ngưỡng ⇒ CONFLICT. Đây là
   fixture chứng minh verdict được tái lập chứ không được tin.

Cộng thêm: mutation runner phải phủ các guard mới, và số đo ghi trong commit body chứ không ghi vào spec.

## 7. Thứ tự commit

1. `contract(ci): freeze the three scan predicates as schemas` — §4 + fixtures.
2. `contract(ci): make the collector verify the evidence it reports` — `evidenceVerification` vào
   `presentMarker`, các phép kiểm vào decision, fixtures §5.
3. `fix(ci): make the marker's own evidence claims answerable` — luật khớp `content.evidence.*.passed` ↔
   `outcomePassed`, và luật tái lập verdict.

Sau đó: bất biến 4 của 3a được nâng về dạng đầy đủ ("collector xác minh; không tài liệu nào tự khẳng định
mình đáng tin"), và **chỉ khi đó** mục 5 (collector) và mục 6 (job publish) được bắt đầu.
