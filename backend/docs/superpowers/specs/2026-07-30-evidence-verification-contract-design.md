# Evidence verification contract — mục 3b

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3b của Contract v1 (PR A — GHCR publish).

Thứ tự thi công: **3a commit 0-4 → 3b → 3a commit 5** (commit 5 đóng băng payload nên nó chờ spec này).

Ba điều khoản của cùng release gate:

- 3a **không** được dùng để tuyên bố evidence đã đáng tin.
- **Không merge và không enable job publish khi chỉ có 3a.**
- **Collector (mục 5) không được bắt đầu trước khi schema 3b đóng băng.**

## 1. Lỗ đang có

`markerContent.evidence.<kind>.<image>` nằm **trong** `content`, tức bên trong tài liệu do producer viết.
`passed: true` vì thế là marker tự khai, và nó va vào bất biến:

> Collector xác minh; decision chỉ quyết định từ kết quả đã xác minh. Không tài liệu nào tự khẳng định
> mình đáng tin.

`marker_problems` hiện chỉ kiểm tính nhất quán nội bộ của các trường đó. Không phép kiểm nào đi ra ngoài
marker. Một marker khai tám lần `passed: true` mà chưa từng có scan nào chạy sẽ đi qua toàn bộ 3a.

## 2. A′ — evidence-set có manifest và tag neo giữ

"Push raw blob rồi ghi digest vào payload" đã bị loại: **một digest nằm trong JSON không tạo OCI descriptor
edge.** Tag trỏ tới manifest, không trỏ tới blob; blob không manifest nào tham chiếu là rác chờ bị thu, nên
evidence sẽ biến mất đúng lúc cần nó nhất, và biến mất **im lặng**.

A′:

- **Hai** evidence-set artifact mỗi commit: monolith và frontend.
- Mỗi artifact có **đúng bốn** canonical report layer.
- **Mỗi layer nhận mediaType riêng** — `application/vnd.evts.evidence.sbom.v1+json`,
  `.../vulnerabilityScan.v1+json`, `.../layerSecretScan.v1+json`, `.../filesystemSecretScan.v1+json`. Thứ
  tự layer cũng đóng băng, nhưng **định danh theo mediaType, không theo vị trí**: định danh theo vị trí vỡ
  im lặng khi thứ tự đổi, mediaType sai thì lộ ra ngay. Bốn mediaType phải đủ và không trùng.
- Tag bất biến: `evidence-monolith-sha-<commit>`, `evidence-frontend-sha-<commit>`.
- `subject` = descriptor **đầy đủ** của image (`mediaType`, `digest`, `size`). Nhưng **tag là neo
  reachability chính** — hỗ trợ referrers API của GHCR không được coi là điều đã biết. (Marker thì `subject`
  phải vắng; 3a §2 giải thích vì sao hai luật này khác nhau có chủ đích.)
- Marker payload mang `evidenceSetDigest` **dưới root key `evidence`**, không thêm key thứ tám.
- Mỗi entry mang descriptor `{mediaType, digest, size}`.

Chi phí thật: **8 report blob + 2 carrier manifest** mỗi commit.

### `release-evidence-set.schema.json`

Đóng băng đối xứng với marker, vì cùng một nội dung logic vẫn tạo được nhiều carrier digest khác nhau:

| Thành phần | Giá trị |
|---|---|
| `schemaVersion` | `2` |
| `mediaType` | `application/vnd.oci.image.manifest.v1+json` |
| `artifactType` | `application/vnd.evts.evidence-set.v1+json` |
| `config` | empty descriptor y như marker (`mediaType`, `digest`, `size`, `data: "e30="`), exact field set, **và blob `{}` phải được push** |
| `layers` | đúng bốn, exact field set mỗi descriptor, bốn mediaType ở trên |
| `subject` | descriptor đầy đủ của image |
| `annotations` | **key phải vắng** ở cả bốn cấp: manifest, config descriptor, và mỗi layer descriptor |
| tag policy | đúng hai tag ở trên, bất biến, cùng repository với image |

Dựng và kiểm bằng đúng thủ tục 6 bước của 3a §2 (tự dựng manifest → `oras manifest push` → fetch lại →
assert → mới attest/promote).

### Lifecycle

Retention, offline archive và scheduled reachability check phải phủ **cả** carrier manifest **và** tám
report blob. Một retention rule chỉ nhìn tag của image sẽ để evidence hết hạn trước release nó bảo chứng.

`cleanupDebt`: evidence-set **là** cleanup debt cho đến khi final marker tồn tại, và chỉ **sau** final
marker nó mới ra khỏi khái niệm đó. Bản trước nói "ngoài `cleanupDebt`" không điều kiện — sai: một
evidence-set không có marker nào tham chiếu chính là rác của một lần chạy dở.

## 3. Đường resume: evidence-set được tạo **trước** marker

Evidence-set phải tồn tại trước prepared marker, vì marker tham chiếu digest của nó. Nên có một cửa sổ mà
workflow chết sau khi tạo evidence-set và trước khi có marker. Hôm nay decision sẽ thấy `ABSENT` →
`build_new` và không hề quan sát được evidence-set cũ.

Sửa: **hai top-level lookup mới**, `monolithEvidenceSet` và `frontendEvidenceSet`.

> Bất biến "đúng tám lookup" trở thành **đúng mười**. Con số tám chưa bao giờ là điều đáng giữ — điều đáng
> giữ là *đúng những tài nguyên mà decision suy luận trên, không thiếu không thừa*. Giữ số tám khi có tài
> nguyên thứ chín là làm state machine mù trước một thứ nó phải quyết định về.

`evidenceSetLookup` = `present | absent(404) | error`, và ở `present` nó chứng minh:

- tag resolve đúng digest đó
- carrier tồn tại và đọc được
- `subject` là descriptor đúng của image
- đúng bốn layer, đúng bốn mediaType, không thiếu không trùng
- layer descriptor khớp descriptor mà marker khai (khi đã có marker)
- mỗi report là **thành viên** của evidence-set đó, không phải một blob trôi nổi cùng digest

Không có lookup này thì tám report có thể xanh hết trong khi `evidenceSetDigest` trỏ tới một object không
tồn tại.

### "Tag tồn tại nhưng khác" nghĩa là khác **cái gì**

Đây là chỗ tôi không làm theo nguyên văn. Nếu "khác" nghĩa là nội dung report khác, thì luật đó **chặn mọi
lần rerun**: một lượt chạy lại sau khi Trivy cập nhật vulnerability DB sẽ sinh report khác đi một cách hoàn
toàn chính đáng, và release sẽ CONFLICT vĩnh viễn cho tới khi có người xoá tag bằng tay.

Luật dùng được:

| Trạng thái | Kết quả |
|---|---|
| chưa có tag | tạo mới |
| tag tồn tại, structurally valid, provenance nói nó sinh từ **commit này** bởi **workflow này**, `subject` đúng image | **adopt** — dùng lại, không re-scan, không so nội dung |
| tag tồn tại nhưng provenance/subject/structure không khớp | **CONFLICT** |
| registry hoặc API lỗi | **UNKNOWN**, không mutate gì |

Lý do adopt chứ không re-scan: evidence-set là bất biến và đã được attest. Việc của một lượt rerun là *hoàn
tất release*, không phải *tái phái sinh evidence*. Release nói về evidence của commit này tại thời điểm
build; một DB mới hơn là một release mới, không phải một lời phủ định release cũ.

## 4. Hai loại entry: SBOM không dùng chung contract với scan

SPDX là predicate **inventory**. Nó không có `reportDigest`, không `findings`, không `policy`, không verdict.

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
biến có nghĩa cho SBOM: document validate được theo SPDX 2.3, subject của nó là image đang release, và nó
không rỗng.

### Binding của SBOM chạy chiều ngược lại

Bản trước đòi tuple chọn attestation chứa report digest cho **mọi** kind, trong khi SPDX predicate không có
field đó — tự mâu thuẫn. Với SBOM, thứ tự là:

1. Verify attestation SPDX (subject = image digest, predicate type = SPDX URI đã pin).
2. Lấy predicate **đã ký**.
3. Canonicalize bằng **cùng** canonicalizer (3a §3).
4. Tính digest và size của bytes canonical đó.
5. So với descriptor của **SBOM layer** trong evidence-set.

Ba custom scan predicate thì ngược lại: chúng **mang** `predicate.reportDigest`, nên binding đọc trực tiếp.

## 5. Hai lookup độc lập, và hai union khác nhau

`evidenceVerification` phẳng không biểu diễn được ma trận: `found: false` không thể đồng thời mang
signer/subject/outcome có nghĩa, nhưng bỏ các field đó thì luật "thiếu field ⇒ UNKNOWN" phủ định luật
"found false ⇒ CONFLICT".

```
evidenceVerification.<kind>.<image> = { reportLookup, attestationLookup }
```

Hai union **không** dùng chung `absent`, vì hai nguồn trả lời "không có" theo hai cách khác nhau:

| | `reportLookup.absent` | `attestationLookup.absent` |
|---|---|---|
| nguồn | registry OCI | GitHub Attestations API (collection) |
| bằng chứng | `observedCode: 404` + OCI ref | `reason: "no_matching_attestation"`, `paginationComplete: true`, + query tuple đầy đủ |

API liệt kê attestations trả **200 với danh sách rỗng** sau khi phân trang hết; đó không phải 404, và khai
nó là 404 là khai một quan sát không ai thực hiện. `paginationComplete` là điều làm "không có" thành một
kết luận thay vì một lần bỏ dở.

### Trust boundary: report và attestation không được trộn

Bản trước để "verified predicate" trong `reportLookup.present`. Sai: fetch report chỉ chứng minh
bytes/hash/schema của report. Chữ ký, signer và source revision thuộc `attestationLookup`.

| | `present` chứa |
|---|---|
| `reportLookup` | descriptor `{mediaType,digest,size}`, kết quả hash và size, kết quả validate schema, **normalized report** |
| `attestationLookup` | subject, predicate type, signer repository/workflow, source revision, kết quả verify bundle, **normalized signed predicate** |

Decision so **hai kết quả độc lập** với nhau. Hai bên đọc được nhưng nói khác nhau ⇒ CONFLICT — đó chính là
trường hợp mà việc tách ra để bắt.

Tải được nhưng schema sai ⇒ **CONFLICT** (producer artifact hỏng). Chỉ validator hoặc API không chạy được
mới ⇒ UNKNOWN.

### Hai ràng buộc về vị trí và về vòng quét

1. **Không đẩy lỗi của một evidence lên `finalMarker.status: "error"`.** Marker đã đọc thành công thì không
   được biến thành "không đọc được marker".
2. Mười sáu evidence lookup **nằm lồng** trong `presentMarker.evidenceVerification`. Vòng quét retryable ở
   `publish-decision.sh:383-391` phải được mở rộng để tới chúng, và mở rộng bằng cách **liệt kê đúng các
   path**, không recursive trên mọi object có khoá `status` — recursive sẽ bắt cả những object mà `status`
   nghĩa khác. Luật retryable: 408/429/5xx/timeout retryable; 401/403 và response hỏng thì không; **nhiều
   lỗi thì `retryable` chỉ khi tất cả đều retryable** (xem 3a §10 commit 4 — hôm nay nó `return` ở lỗi đầu
   tiên theo thứ tự alphabet).

`evidenceVerification` bắt buộc khi `content` bắt buộc, bị cấm khi `content` bị cấm (3a §5).

## 6. Decision tái lập verdict

`reportLookup.present.normalizedReport` của một scan entry mang:

| Trường | Nghĩa |
|---|---|
| `scanner` | name, version, và DB/ruleset identity (§7) |
| `target` | `imageDigest`, phải khớp subject của attestation |
| `policy` | ngưỡng severity, danh sách ignore, digest của file ignore |
| `findings` | counts theo severity **cộng** danh sách bounded các mục ở/trên ngưỡng, cờ `truncated` |
| `declaredOutcome` | verdict mà report tự khai |

Decision tính `recomputedOutcome` từ `findings` + `policy`, rồi so với `declaredOutcome`, với
`attestationLookup.present.normalizedPredicate.declaredOutcome`, **và** với `content.evidence.<kind>.<image>`.
Bất kỳ hai chỗ lệch nhau ⇒ CONFLICT.

Verdict tính từ **counts**, nên một danh sách bị truncate không đổi được kết quả. Danh sách không truncated
mà không khớp counts ⇒ CONFLICT.

**Verdict policy** (chọn, có thể override): vulnerability fail khi có `CRITICAL`, hoặc `HIGH` **có fix**;
secret scan (cả hai loại) fail khi có **bất kỳ** finding.

## 7. Ba schema custom predicate

`.github/contracts/predicates/{vulnerabilityScan,layerSecretScan,filesystemSecretScan}.schema.json`.

`vulnerabilityDbUpdatedAt` **không** thuộc secret scan — Trivy vulnerability DB chỉ phục vụ vulnerability
scanning; secret scan chạy trên builtin/custom rules và allow rules:

| | vulnerability | secret (cả hai) |
|---|---|---|
| scanner name, version | có | có |
| vulnerability DB identity + digest/updatedAt | **có** | **không** |
| ruleset/config version + digest | **không** | **có** |

Timestamp được phép trong predicate (khác payload marker): predicate không bị re-tag.

### Hai loại secret scan quét gì, và bằng gì

`layerSecretScan` quét **từng layer** riêng — bắt được secret bị xoá ở layer sau: không còn trong rootfs
cuối nhưng vẫn nằm trong image và vẫn lấy ra được. `filesystemSecretScan` quét **rootfs đã flatten** — bắt
được secret thật sự hiện diện lúc chạy. Cả hai nói về image, nên `subject = image digest` đúng cho cả hai và
**không cần đổi tên**.

Đóng băng cách extract, vì cách flatten khác cho kết quả khác trên cùng một image (các giá trị dưới đây là
lựa chọn, mang cùng nhãn kỷ luật như URI SPDX ở 3a §7: xác nhận trên lượt runner đầu tiên, không "học" từ
output):

| | Công cụ | Whiteout |
|---|---|---|
| flatten | `crane export` (version + digest pinned) | **áp dụng** — đó chính là nghĩa của flatten |
| per-layer | `crane blob` theo từng layer digest, extract riêng | **bỏ qua có chủ đích** — đó chính là điểm của phép quét này |

Scan chạy bằng `trivy fs --scanners secret` trên cây đã extract, version + digest pinned.

Giới hạn byte, áp **trước** khi tải, theo đúng kỷ luật size-before-hash của 3a §2:

| Đối tượng | Cap |
|---|---|
| report blob | 8 MiB |
| carrier manifest, marker manifest | 64 KiB |
| marker payload | 256 KiB |
| layer blob khi per-layer scan | 2 GiB |
| danh sách `findings` | 100 mục, rồi `truncated: true` |

Descriptor khai vượt cap ⇒ CONFLICT, **không** tải.

## 8. Chọn attestation: paginate, tuple đầy đủ, và duplicate ngữ nghĩa

API trả một **collection**. Collector phải paginate hết và chọn bằng tuple đầy đủ: repository, workflow,
source revision, image subject, predicate type, và — với ba scan — report digest. **Không dùng "bản đầu
tiên".**

- Không bản nào khớp, sau khi paginate hết ⇒ `absent` (§5) ⇒ CONFLICT.
- Lỗi giữa phân trang (5xx ở trang 3) ⇒ `error` ⇒ UNKNOWN. Kết quả thu được một phần **không** được coi là
  đã tìm hết.
- **Nhiều bản khớp tuple thì không tự động là CONFLICT.** Luật bản trước làm hỏng tính idempotent: một lượt
  rerun có thể sinh bundle chữ ký khác nhau cho cùng một statement. Luật đúng: chấp nhận **semantic
  duplicate** — nhiều bundle đáng tin mà statement giống nhau về nội dung và outcome thì chọn cái nào cũng
  được. CONFLICT chỉ khi các statement **đáng tin** khác nhau về nội dung hoặc outcome; đó mới là chỗ cần
  người.

## 9. Canonical

Report dùng **cùng** canonicalizer với 3a (3a §3): cùng hàm, cùng tham số đã khoá (`ensure_ascii=True`,
`allow_nan=False`, từ chối key trùng khi đọc, cấm float), cùng golden bytes fixture. Thứ tự `findings` do
schema quy định, không do scanner quyết — nếu không, cùng một scan cho ra hai digest.

## 10. Ma trận

| Tình huống | Kết quả |
|---|---|
| mười lookup sạch, 8 evidence cả hai lookup `present`, hash khớp, chữ ký đạt, `recomputedOutcome` khớp cả ba chỗ | tiếp tục |
| evidence-set: chưa có tag | `build_new` (tạo mới) |
| evidence-set: adopt được (provenance + subject + structure khớp) | reuse, không re-scan |
| evidence-set: provenance/subject/structure không khớp | CONFLICT |
| evidence-set: thiếu/trùng mediaType, khác bốn layer, `subject` sai, có `annotations` | CONFLICT |
| `evidenceSetDigest` trong marker không resolve | CONFLICT |
| report không phải thành viên của evidence-set | CONFLICT |
| `reportLookup: absent` (404 đã xác nhận) | CONFLICT |
| `attestationLookup: absent` (`paginationComplete: true`, không khớp tuple) | CONFLICT |
| nhiều statement đáng tin khác nội dung/outcome | CONFLICT |
| chữ ký sai, sai signer, sai subject, sai predicate type | CONFLICT |
| report tải được nhưng schema sai | CONFLICT |
| rehash lệch descriptor, hoặc lệch `predicate.reportDigest`, hoặc SBOM lệch layer descriptor | CONFLICT |
| `recomputedOutcome` fail, hoặc lệch `declaredOutcome`, hoặc lệch marker | CONFLICT |
| `findings` không truncated mà không khớp counts | CONFLICT |
| SBOM `documentValidated: false`, subject không phải image đang release, hoặc rỗng | CONFLICT |
| descriptor khai vượt cap | CONFLICT |
| thiếu entry, thiếu field, sai kiểu trong `evidenceVerification` (collector-derived) | UNKNOWN |
| timeout / 429 / 5xx / verifier crash / output hỏng | UNKNOWN, qua `error` của **evidence lookup**, không phải của marker lookup |
| 401 / 403 / response hỏng | UNKNOWN, **không** retryable |

## 11. Test và fixtures

Mở rộng `manifest-agreement.test.sh`. Mỗi hàng ở §10 có ít nhất một fixture, mỗi fixture phải chứng minh đỏ
được.

Sáu witness bắt buộc:

1. Marker khai đủ tám evidence hợp lệ, nhưng một `reportLookup: absent` ⇒ CONFLICT. Self-assertion đã bị đóng.
2. `declaredOutcome: true` mà `findings` có mục ở/trên ngưỡng ⇒ CONFLICT. Verdict được tái lập, không được tin.
3. Hai statement đáng tin **khác outcome** ⇒ CONFLICT; hai bundle khác chữ ký **cùng statement** ⇒ tiếp tục.
   Idempotent không bị luật duplicate làm hỏng.
4. Evidence lookup `error` (5xx) ⇒ UNKNOWN **và** marker lookup vẫn `present`. Lỗi evidence không leo lên
   thành lỗi đọc marker.
5. Evidence-set tồn tại, marker vắng, provenance khớp ⇒ adopt, không CONFLICT. Đường resume sống.
6. Hai lỗi cùng lúc, một retryable một không ⇒ `retryable: false`. Không phụ thuộc thứ tự alphabet.

Thêm: oversize descriptor, SBOM subject mismatch, crash giữa phân trang, và mutation phủ từng guard mới. Số
đo ghi trong commit body, không ghi vào spec.

## 12. Thứ tự commit

1. `contract(ci): decide where evidence lives and how long it lives` — A′ + `release-evidence-set.schema.json`
   (§2), lifecycle, và `cleanupDebt` có điều kiện.
2. `contract(ci): let the decision see the evidence set` — §3, hai top-level lookup (tám → **mười**),
   `evidenceSetLookup`, luật adopt/conflict.
3. `contract(ci): freeze what the scanners are and what they scan` — §7, scanner provenance tách vuln/secret,
   cách extract, byte cap.
4. `contract(ci): give each evidence two lookups of its own` — §5, hai union riêng, tách trust boundary, mở
   rộng vòng quét retryable theo path liệt kê.
5. `contract(ci): make the scan verdict something the decision recomputes` — §6.
6. `contract(ci): stop asking a SBOM for a verdict it does not make` — §4, `documentValidated`, binding chiều
   ngược.
7. `contract(ci): select an attestation by its whole tuple` — §8, paginate, semantic duplicate.

Sau đó 3a commit 5 (đóng băng payload) mới chạy được. Rồi bất biến 4 của 3a nâng về dạng đầy đủ, và **chỉ
khi đó** mục 5 (collector) và mục 6 (job publish) được bắt đầu.
