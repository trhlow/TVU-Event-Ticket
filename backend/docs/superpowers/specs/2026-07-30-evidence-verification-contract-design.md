# Evidence verification contract — mục 3b

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3b của Contract v1 (PR A — GHCR publish).

Viết **cùng lúc** với 3a (`2026-07-30-release-manifest-contract-design.md`). **Triển khai sau khi commit
0-4 của 3a xanh**, và commit đóng băng payload của 3a (commit 5) **chờ spec này final** — xem §3.

Ba điều khoản của cùng release gate:

- 3a **không** được dùng để tuyên bố evidence đã đáng tin.
- **Không merge và không enable job publish khi chỉ có 3a.**
- **Collector (mục 5) không được bắt đầu trước khi schema 3b đóng băng.**

## 1. Lỗ đang có

`markerContent.evidence.<kind>.<image>` mang `digest`, `subjectDigest`, `predicateType`, `passed`. Cả bốn
nằm **trong** `content`, tức bên trong tài liệu do producer viết. `passed: true` vì thế là marker tự khai,
và nó va thẳng vào bất biến của hợp đồng:

> Collector xác minh; decision chỉ quyết định từ kết quả đã xác minh. Không tài liệu nào tự khẳng định
> mình đáng tin.

`marker_problems` hiện chỉ kiểm *tính nhất quán nội bộ* của các trường đó. Không phép kiểm nào đi ra ngoài
marker để hỏi attestation đó có thật, có được ký, và có nói cùng một điều. Một marker khai tám lần
`passed: true` mà chưa từng có scan nào chạy sẽ đi qua toàn bộ 3a.

## 2. A′ — evidence-set có manifest và tag neo giữ

Phương án "push raw blob rồi ghi digest vào payload" đã bị loại: **một digest nằm trong JSON không tạo ra
OCI descriptor edge.** Tag trỏ tới manifest, không trỏ tới blob; blob chỉ được truy xuất trong phạm vi một
repository và không có manifest nào tham chiếu thì nó là rác chờ bị thu. Evidence sẽ biến mất đúng lúc cần
nó nhất, và biến mất **im lặng**.

A′:

- **Hai** evidence-set artifact mỗi commit: một cho monolith, một cho frontend.
- Mỗi artifact có **bốn** canonical report layer.
- **Mỗi report layer nhận mediaType riêng** — `application/vnd.evts.evidence.sbom.v1+json`,
  `.../vulnerabilityScan.v1+json`, `.../layerSecretScan.v1+json`, `.../filesystemSecretScan.v1+json`. Thứ
  tự layer cũng bị đóng băng, nhưng **định danh theo mediaType, không theo vị trí**: định danh theo vị trí
  vỡ im lặng khi thứ tự đổi, còn mediaType thì sai là lộ ra ngay.
- Tag bất biến: `evidence-monolith-sha-<commit>`, `evidence-frontend-sha-<commit>`.
- `subject` = digest của image mà set nói về. Nhưng **tag vẫn là neo reachability chính** — hỗ trợ
  referrers API của GHCR không được coi là điều đã biết. (Marker thì `subject` phải vắng; xem ghi chú
  trong 3a §2 về việc hai luật này khác nhau có chủ đích.)
- Marker payload mang `evidenceSetDigest` cho mỗi image; mỗi entry mang descriptor `{mediaType, digest, size}`.

Chi phí thật: **8 report blob + 2 carrier manifest** mỗi commit, không phải "8 object".

Lifecycle phải phủ **cả** carrier manifest **và** tám report blob: retention policy, offline archive, và
scheduled reachability check. Một retention rule chỉ nhìn tag của image sẽ để evidence hết hạn trước release
nó bảo chứng. `cleanupDebt` trong `publish-decision.sh` hiện chỉ đếm candidate; 3b phải nói rõ evidence-set
nằm trong hay ngoài khái niệm đó — đề xuất: **ngoài**, vì candidate là rác của một lần chạy dở, còn
evidence-set là thứ phải sống lâu bằng release.

## 3. Vì sao 3a không thể đóng băng payload trước spec này

A′ đổi hình dạng `evidence` bên trong 7 key của payload:

| Thay đổi | Ảnh hưởng |
|---|---|
| entry mang descriptor `{mediaType,digest,size}` thay cho `digest` trơ | `evidenceEntry` đổi shape |
| payload mang `evidenceSetDigest` per image | thêm nhánh trong `evidence`, hoặc một key mới trong 7 key |
| entry SBOM khác hình dạng ba entry scan (§4) | `perImageEvidence` không còn đồng nhất bốn kind |

Câu "3a không phụ thuộc kết quả fork" trong bản trước là **sai**. Quyết định này là final trước commit
schema payload của 3a, và 3a §10 đã được sửa để commit đó đứng cuối.

## 4. Hai loại entry: SBOM không dùng chung contract với scan

SPDX SBOM là một predicate **inventory** chuẩn. Nó không có `reportDigest`, không có `findings`, không có
`policy`, và không có verdict `passed`. Bắt nó mang những thứ đó là phát minh một verdict cho một tài liệu
không phát biểu verdict nào.

| | `sbomVerificationEntry` | `scanVerificationEntry` |
|---|---|---|
| chữ ký, cert identity | có | có |
| signer repository / workflow | có | có |
| subject = image digest | có | có |
| predicate type đã pin | SPDX URI | URI `evts.id.vn` tương ứng |
| report descriptor | có | có |
| SPDX schema + content binding | có | — |
| policy, findings, recomputed outcome | **không** | có |
| outcome | **không có** | `declaredOutcome` + `recomputedOutcome` |

Hệ quả lên payload: `content.evidence.sbom.<image>.passed` **bị bỏ**, đổi thành `documentValidated`. Bất
biến có nghĩa cho SBOM là: document validate được theo SPDX 2.3, subject của nó là image đang release, và
nó không rỗng (có package). "Passed" thì không có nghĩa gì để mà kiểm.

## 5. Hai lookup độc lập cho mỗi evidence

`evidenceVerification` phẳng của bản trước **không biểu diễn được ma trận**: `found: false` không thể đồng
thời mang signer/subject/predicate/outcome có nghĩa, nhưng nếu bỏ các field đó thì luật "thiếu field ⇒
UNKNOWN" lại phủ định luật "found false ⇒ CONFLICT". Đúng hình dạng mâu thuẫn cứng đã gặp hai lần.

Sửa bằng cách **dùng lại union đang có** (`present | absent(404) | error`), không phát minh gì:

```
evidenceVerification.<kind>.<image> = {
  reportLookup:      present | absent | error
  attestationLookup: present | absent | error
}
```

- `absent` **đã xác nhận** (404), hoặc bytes/chữ ký/hash sai ⇒ **CONFLICT**
- timeout, 429, 5xx, API hoặc verifier crash, output hỏng ⇒ **UNKNOWN**

Hai ràng buộc quan trọng:

1. **Không được đẩy lỗi của một evidence lên `finalMarker.status: "error"`.** Marker đã đọc thành công thì
   không được biến thành "không đọc được marker" — đó là gửi người trực sự cố đi tìm sai thứ.
2. Vì `lookups` ở cấp cao nhất là **đúng tám key** với `additionalProperties: false`, mười sáu evidence
   lookup phải **nằm lồng** trong `presentMarker.evidenceVerification`, không phải thêm key ở cấp cao nhất.
   Kéo theo: vòng quét retryable ở `publish-decision.sh:383-391` hiện chỉ đi qua `lookups` cấp cao nhất, nên
   nó **phải được mở rộng** để phủ các lookup lồng, với đúng cùng luật retryable (408, 429, 5xx, timeout).
   Không mở rộng thì một evidence lookup `error` sẽ rơi qua và bị xử như dữ liệu hợp lệ.

## 6. Decision phải có dữ liệu để tái lập verdict

Bản trước yêu cầu decision tái lập `passed` từ `findings + policy` nhưng chỉ đưa `outcomePassed` vào entry —
tự phủ định: fixture "outcome true nhưng findings vượt ngưỡng" không dựng được từ shape đó.

`reportLookup` ở trạng thái `present` của một scan entry mang predicate đã xác minh ở **dạng normalized**:

| Trường | Nghĩa |
|---|---|
| `scanner` | name, version, và DB/ruleset identity (§7 — khác nhau giữa vuln và secret) |
| `target` | `imageDigest`, phải khớp subject của attestation |
| `policy` | đầy đủ: ngưỡng severity, danh sách ignore, digest của file ignore |
| `findings` | chuẩn hoá: đếm theo severity **cộng** danh sách bounded các mục ở/trên ngưỡng |
| `reportDescriptor` | `{mediaType, digest, size}` |
| `declaredOutcome` | verdict mà predicate tự khai |

Decision **tự tính** `recomputedOutcome` từ `findings` + `policy`, rồi so với `declaredOutcome` **và** với
`content.evidence.<kind>.<image>`. Ba chỗ lệch nhau ⇒ CONFLICT. Cùng luật đã áp cho
`flywayInventory.checksum`: một verdict nobody derives là một field, và một field thì copy được từ lần chạy
khác.

`findings` phải **bounded**, vì observation là input của một hàm thuần và một scan xấu có thể sinh hàng chục
nghìn mục: verdict tính từ **counts** (nên nó không phụ thuộc độ dài danh sách), danh sách chỉ để người đọc,
có cap và cờ `truncated`. Nếu danh sách không truncated mà không khớp counts ⇒ CONFLICT.

## 7. Ba schema custom predicate

`.github/contracts/predicates/{vulnerabilityScan,layerSecretScan,filesystemSecretScan}.schema.json`.

**`vulnerabilityDbUpdatedAt` không thuộc secret scan.** Trivy vulnerability DB chỉ phục vụ vulnerability
scanning; secret scan chạy trên builtin/custom rules và allow rules. Nên scanner provenance khác nhau:

| | vulnerability | secret (cả hai loại) |
|---|---|---|
| scanner name, version | có | có |
| vulnerability DB identity + digest/updatedAt | **có** | **không** |
| ruleset / config version + digest | **không** | **có** |

Timestamp được phép trong predicate (khác payload marker ở 3a): predicate không bị re-tag, nên nó không mang
ràng buộc "tạo một lần, digest bất biến".

### `filesystemSecretScan` và `layerSecretScan` quét cái gì

Đề nghị đổi tên của bạn dựa trên giả định `trivy fs` chạy trên source tree. Không phải — phân biệt này đã
chốt từ trước và nó là lý do có **hai** loại secret scan:

- `layerSecretScan` — quét **từng layer** riêng. Bắt được secret bị xoá ở layer sau: nó không còn trong
  filesystem cuối nhưng vẫn nằm trong image và vẫn lấy ra được.
- `filesystemSecretScan` — quét **rootfs đã flatten** của image. Bắt được secret thật sự hiện diện lúc chạy.

Cả hai đều nói về image, nên `subject = image digest` đúng cho cả hai và **không cần đổi tên**. Điều cần
đóng băng là **cách flatten**: dùng công cụ nào, ở version nào, và có bao gồm whiteout file hay không — vì
một cách flatten khác cho ra kết quả khác trên cùng một image.

## 8. Chọn attestation: paginate và dùng tuple đầy đủ

GitHub Attestations API trả về một **collection**, không phải một bản. Collector phải paginate hết và chọn
bằng tuple đầy đủ: repository, workflow, source revision, image subject, predicate type, **và** report
digest. **Không dùng "bản đầu tiên".**

- Không bản nào khớp tuple, sau khi đã paginate hết ⇒ `attestationLookup: absent` ⇒ CONFLICT.
- **Nhiều hơn một** bản khớp toàn bộ tuple ⇒ CONFLICT, không phải "chọn cái mới nhất". Hai attestation
  không phân biệt được nhau cho cùng một report là chuyện cần người xem.
- Lỗi phân trang giữa đường (5xx ở trang 3) ⇒ `error` ⇒ UNKNOWN. Không được coi kết quả thu được một phần
  là "đã tìm hết".

## 9. Canonical và giới hạn tải

Report dùng **cùng** canonicalizer với 3a (3a §3, "Canonicalizer dùng chung") — cùng hàm, cùng golden bytes
fixture. Thứ tự `findings` do schema quy định, không do scanner quyết, nếu không cùng một scan cho ra hai
digest.

Mỗi report descriptor mang `size` và `mediaType`, và collector áp **hard cap trước khi tải**, đúng kỷ luật
size-before-hash của 3a §2. Một descriptor khai 40 GB không được biến thành một lần tải 40 GB để rồi mới
kết luận.

## 10. Ma trận

| Tình huống | Kết quả |
|---|---|
| tất cả 8 evidence: cả hai lookup `present`, hash khớp, chữ ký đạt, `recomputedOutcome` khớp cả `declaredOutcome` và marker | tiếp tục |
| `reportLookup: absent` (404 đã xác nhận) | CONFLICT |
| `attestationLookup: absent` (paginate hết, không khớp tuple) | CONFLICT |
| nhiều hơn một attestation khớp toàn bộ tuple | CONFLICT |
| chữ ký sai, sai signer, sai subject, sai predicate type | CONFLICT |
| report rehash lệch descriptor, hoặc lệch `predicate.reportDigest` | CONFLICT |
| `recomputedOutcome` là fail | CONFLICT |
| `declaredOutcome` lệch `recomputedOutcome` | CONFLICT |
| `recomputedOutcome` lệch `content.evidence.<kind>.<image>` | CONFLICT |
| `findings` không truncated mà không khớp counts | CONFLICT |
| SBOM: `documentValidated: false`, hoặc subject SPDX không phải image đang release, hoặc rỗng | CONFLICT |
| descriptor `size` vượt hard cap | CONFLICT |
| thiếu entry, thiếu field, sai kiểu trong `evidenceVerification` (collector-derived) | UNKNOWN |
| timeout / 429 / 5xx / verifier crash / output hỏng | UNKNOWN, qua `status: "error"` của **evidence lookup**, không phải của marker lookup |

Cùng luật §4 của 3a: kết luận âm đã hoàn tất ⇒ CONFLICT; không hoàn tất được ⇒ UNKNOWN. Collector **không**
được biến mọi exit code khác 0 của `gh attestation verify` thành một kết luận âm.

## 11. Test và fixtures

Mở rộng `manifest-agreement.test.sh` (không tạo file thứ ba). Mỗi hàng CONFLICT và mỗi hàng UNKNOWN ở §10
có ít nhất một fixture, và mỗi fixture phải chứng minh đỏ được.

Bốn witness bắt buộc, vì chúng là lý do 3b tồn tại:

1. Marker khai đủ tám evidence hợp lệ, nhưng một `reportLookup: absent` ⇒ CONFLICT. Chứng minh self-assertion
   đã bị đóng.
2. `declaredOutcome: true` mà `findings` có mục ở/trên ngưỡng ⇒ CONFLICT. Chứng minh verdict được tái lập
   chứ không được tin.
3. Hai attestation khớp toàn bộ tuple ⇒ CONFLICT. Chứng minh "bản đầu tiên" không phải một cách chọn.
4. Một evidence lookup `error` (5xx) ⇒ UNKNOWN **và** marker lookup vẫn `present`. Chứng minh lỗi evidence
   không bị đẩy lên thành lỗi đọc marker.

Thêm: oversize descriptor, SBOM subject mismatch, crash recovery giữa phân trang, và mutation phủ từng guard
mới. Số đo ghi trong commit body, không ghi vào spec.

## 12. Thứ tự commit

1. `contract(ci): decide where evidence lives and how long it lives` — A′: mediaType cho bốn report, hai
   tag bất biến, `release-evidence-set.schema.json` cho carrier, và lifecycle/retention/reachability.
2. `contract(ci): freeze the three scan predicates as schemas` — §7, gồm scanner provenance khác nhau giữa
   vuln và secret, và cách flatten đã đóng băng.
3. `contract(ci): give each evidence two lookups of its own` — §5, union `present|absent|error`, và **mở
   rộng vòng quét retryable** để phủ lookup lồng.
4. `contract(ci): make the scan verdict something the decision recomputes` — §6, normalized predicate,
   bounded findings, `recomputedOutcome`.
5. `contract(ci): stop asking a SBOM for a verdict it does not make` — §4, `sbomVerificationEntry`, bỏ
   `evidence.sbom.*.passed` đổi sang `documentValidated`.
6. `contract(ci): select an attestation by its whole tuple` — §8, paginate, nhiều-bản ⇒ CONFLICT.

Sau đó: 3a commit 5 (đóng băng payload) mới chạy được, vì shape `evidence` lúc này đã final. Rồi bất biến 4
của 3a được nâng về dạng đầy đủ ("collector xác minh; không tài liệu nào tự khẳng định mình đáng tin"), và
**chỉ khi đó** mục 5 (collector) và mục 6 (job publish) được bắt đầu.
