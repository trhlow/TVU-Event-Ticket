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
- **Mỗi layer nhận mediaType riêng**, viết đủ, không viết tắt:
  - `application/vnd.evts.evidence.sbom.v1+json`
  - `application/vnd.evts.evidence.vulnerabilityScan.v1+json`
  - `application/vnd.evts.evidence.layerSecretScan.v1+json`
  - `application/vnd.evts.evidence.filesystemSecretScan.v1+json`

  Thứ tự layer cũng đóng băng, nhưng **định danh theo mediaType, không theo vị trí**: định danh theo vị trí
  vỡ im lặng khi thứ tự đổi, mediaType sai thì lộ ra ngay. Bốn mediaType phải đủ và không trùng.
- Tag bất biến: `evidence-monolith-sha-<commit>`, `evidence-frontend-sha-<commit>`.
- `subject` = descriptor **đầy đủ** của image (`mediaType`, `digest`, `size`), và **không có `annotations`** —
  OCI cho phép annotations trên descriptor, nên phải cấm tường minh, không suy ra. Nhưng **tag là neo
  reachability chính** — hỗ trợ referrers API của GHCR không được coi là điều đã biết. (Marker thì `subject`
  phải vắng; 3a §2 giải thích vì sao hai luật này khác nhau có chủ đích.)
- **Image subject là manifest của `linux/amd64`, không phải OCI index.** `crane` mặc định `all` platform, nên
  không chốt thì bản export và `subject` nói về hai digest khác nhau và không ai phát hiện. Nếu build sinh ra
  index thì `subject` phải là platform manifest bên trong nó.
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
| `annotations` | **key phải vắng** ở cả **năm** cấp: manifest, config descriptor, mỗi layer descriptor, và `subject` descriptor |
| tag policy | đúng hai tag ở trên, bất biến, cùng repository với image |

Dựng và kiểm bằng đúng thủ tục 6 bước của 3a §2 (tự dựng manifest → `oras manifest push` → fetch lại →
assert → mới attest/promote).

### Lifecycle

Retention, offline archive và scheduled reachability check phải phủ **cả** carrier manifest **và** tám
report blob. Một retention rule chỉ nhìn tag của image sẽ để evidence hết hạn trước release nó bảo chứng.

### `cleanupDebt` có bốn trạng thái, không phải hai

Vòng 3 tôi nói evidence-set nằm "ngoài `cleanupDebt`" không điều kiện; vòng 4 tôi sửa quá tay thành "là debt
cho đến khi có final marker". Cả hai đều sai: một evidence-set đã được **prepared marker đáng tin** neo giữ
chính là **tài nguyên phục hồi** của đường PARTIAL, và gọi nó là rác là cho phép xoá đúng thứ làm resume
khả thi.

| Trạng thái | Nghĩa | Cleanup |
|---|---|---|
| unanchored staging | tồn tại, chưa marker nào tham chiếu | adoptable; chỉ được cleanup **sau grace period** |
| prepared-anchored | prepared marker đáng tin tham chiếu nó | **protected** — tài sản phục hồi PARTIAL, không xoá |
| final-anchored | final marker tham chiếu nó | release asset, không xoá |
| invalid / untrusted | structure hoặc provenance không khớp | **giữ để điều tra**, không auto-delete |

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
- mỗi report là **thành viên** của evidence-set đó, không phải một blob trôi nổi cùng digest

Không có lookup này thì tám report có thể xanh hết trong khi `evidenceSetDigest` trỏ tới một object không
tồn tại.

### Bốn cặp lookup nằm **trong** `evidenceSetLookup.present`, không trong marker

Bản trước để mười sáu `reportLookup`/`attestationLookup` trong `presentMarker.evidenceVerification`. Đó là
lỗi: adopt xảy ra **khi chưa có marker**, nên decision chỉ kiểm được structure/provenance/subject của carrier
và chưa chứng minh được bốn report cùng attestation của chúng hợp lệ. Một tag adopt được có thể hoàn toàn
thiếu attestation.

Sửa: mỗi `evidenceSetLookup.present` chứa **bốn cặp** `{reportLookup, attestationLookup}`, một cặp mỗi kind.
Marker chỉ còn **cross-check**: `evidenceSetDigest` và các descriptor mà nó khai phải khớp một kết quả xác
minh **duy nhất** đã có từ lookup cấp cao nhất. Marker không còn là nơi evidence được xác minh.

Kéo theo, adopt đúng nghĩa là:

- **không re-scan**, và
- **verify lại toàn bộ** evidence đã có, và
- tag đã tồn tại mà **thiếu attestation** ⇒ **CONFLICT**. Tuyệt đối **không** ký bổ sung sau đó để hợp thức
  hoá một artifact có sẵn — đó là biến pipeline thành công cụ rửa nguồn gốc cho bytes không rõ ai tạo.

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
tất release*, không phải *tái phái sinh evidence*.

**"DB mới là release mới" phải nói chính xác hơn thế.** Định danh evidence-set chỉ có SHA, nên trong v1
**quét lại cùng một commit là không được hỗ trợ**: muốn evidence mới thì phải có commit mới. Đó là hạn chế
có chủ đích, không phải chỗ bỏ sót — thêm một trục `evidenceRevision` để cho phép hai evidence-set cùng SHA
là mở ra câu hỏi "bản nào là bản đúng" mà v1 không cần phải trả lời. Nếu về sau cần, `evidenceRevision` vào
tag là đường thoát của v2.

### Re-resolve tag ngay trước khi ghi marker

Giữa lúc verify và lúc promote, tag có thể bị trỏ sang chỗ khác. Nên **ngay trước** khi ghi prepared marker
và **ngay trước** khi ghi final marker, resolve lại cả hai tag evidence-set và đòi digest vẫn đúng cái đã
verify. Lệch ⇒ CONFLICT, không ghi. Không có bước này thì toàn bộ chuỗi xác minh nói về một object khác với
object mà marker sẽ trỏ tới.

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
lookups.<image>EvidenceSet.present.evidence.<kind> = { reportLookup, attestationLookup }
```

(Ở cấp cao nhất, **không** trong marker — §3.)

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
   được biến thành "không đọc được marker". Lỗi evidence sống trong lookup evidence-set của chính nó.
2. Mười sáu evidence lookup **nằm lồng** trong hai `*EvidenceSet` cấp cao nhất. Vòng quét retryable ở
   `publish-decision.sh:383-391` phải được mở rộng để tới chúng, và mở rộng bằng cách **liệt kê đúng các
   path**, không recursive trên mọi object có khoá `status` — recursive sẽ bắt cả những object mà `status`
   nghĩa khác. Luật retryable: 408/429/5xx/timeout retryable; 401/403 và response hỏng thì không; **nhiều
   lỗi thì `retryable` chỉ khi tất cả đều retryable** (xem 3a §10 commit 5 — hôm nay nó `return` ở lỗi đầu
   tiên theo thứ tự alphabet).

Phần cross-check trong marker bắt buộc khi `content` bắt buộc, bị cấm khi `content` bị cấm (3a §5).

## 6. Decision tái lập verdict

`reportLookup.present.normalizedReport` của một scan entry mang:

| Trường | Nghĩa |
|---|---|
| `scanner` | name, version, và DB/ruleset identity (§7) |
| `target` | `imageDigest`, phải khớp subject của attestation |
| `policy` | ngưỡng severity, danh sách ignore, digest của file ignore |
| `findings` | counts theo **`(severity, fixAvailable)`** — không chỉ theo severity — cộng danh sách bounded các mục ở/trên ngưỡng, cờ `truncated` |
| `declaredOutcome` | verdict mà report tự khai |

### Counts phải aggregate theo `(severity, fixAvailable)`

Bản trước chỉ đếm theo severity, trong khi policy fail ở "`HIGH` **có fix**". Khi danh sách 100 mục bị
truncate, `HIGH: 50` không cho biết mục nào có fix, nên verdict **không tái lập được** — đúng thứ mà §6 tồn
tại để bảo đảm.

- `fixAvailable` xác định từ **`FixedVersion` của Trivy không rỗng**. Không suy từ text.
- Counts tính **sau** khi áp ignore rules, vì mục bị ignore là mục policy đã cố ý loại. Digest của file
  ignore nằm trong `policy`, nên một file ignore đổi là một cơ sở verdict đổi và nó **lộ ra** thay vì âm thầm.
- Witness bắt buộc: **finding thứ 101 là `HIGH` có fix, verdict vẫn phải fail.** Nếu nó pass thì counts đang
  không đủ để tái lập.

### Thứ tự và trùng lặp của `findings`

"Schema quy định thứ tự" là không thực hiện được — JSON Schema không biểu diễn phép sắp xếp. Nên chốt sort
tuple tường minh, theo thứ tự: **severity rank giảm dần → `fixAvailable` (true trước) → package name →
vulnerability ID → target path**, tất cả so sánh theo code point. Hai mục có **cùng toàn bộ** tuple ⇒ CONFLICT:
một report liệt kê cùng một finding hai lần thì counts của nó không còn tin được.

Decision tính `recomputedOutcome` từ `findings` + `policy`, rồi so với `declaredOutcome`, với
`attestationLookup.present.normalizedPredicate.declaredOutcome`, **và** với `content.evidence.<kind>.<image>`.
Bất kỳ hai chỗ lệch nhau ⇒ CONFLICT.

Verdict tính từ **counts**, nên một danh sách bị truncate không đổi được kết quả. Danh sách không truncated
mà không khớp counts ⇒ CONFLICT.

**Verdict policy**: vulnerability fail khi có `CRITICAL`, hoặc `HIGH` **có fix**; secret scan (cả hai loại)
fail khi có **bất kỳ** finding.

Policy và ruleset phải đến từ **file được Git theo dõi** trong repo, và digest của file nằm trong predicate.
Workflow input **không** được override chúng: một ngưỡng truyền vào lúc chạy là một ngưỡng không ai review
được, và nó biến gate thành thứ mà người bấm nút tự chọn độ chặt.

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
| một layer blob (compressed) khi per-layer scan | 2 GiB |
| **tổng** layer compressed của một image | 8 GiB |
| **tổng bytes sau giải nén** | 24 GiB |
| **số file** sau giải nén | 2 000 000 |
| timeout mỗi lần extract + scan | 20 phút |
| danh sách `findings` | 100 mục, rồi `truncated: true` |

Cap 2 GiB một mình chỉ chặn compressed bytes, nên nó không chặn zip bomb, không chặn một image 60 layer, và
không chặn cạn đĩa runner. Bốn cap kế tiếp là để chặn những thứ đó.

Descriptor khai vượt cap ⇒ CONFLICT, **không** tải. Vượt cap **trong lúc** giải nén ⇒ CONFLICT, dừng ngay.
Mỗi lần extract dọn đĩa trong `trap`/`finally`, kể cả khi fail — một job chết giữa đường không được để lại
20 GiB cho job sau.

## 8. Chọn attestation: paginate, tuple đầy đủ, và duplicate ngữ nghĩa

API trả một **collection**. Collector phải paginate hết và chọn bằng tuple đầy đủ: repository, workflow,
source revision, image subject, predicate type, và — với ba scan — report digest. **Không dùng "bản đầu
tiên".**

- Không bản nào khớp, sau khi paginate hết ⇒ `absent` (§5) ⇒ CONFLICT.
- Lỗi giữa phân trang (5xx ở trang 3) ⇒ `error` ⇒ UNKNOWN. Kết quả thu được một phần **không** được coi là
  đã tìm hết.
- **Nhiều bản khớp tuple thì không tự động là CONFLICT.** Luật bản trước làm hỏng tính idempotent: một lượt
  rerun có thể sinh bundle chữ ký khác nhau cho cùng một statement. Luật đúng: chấp nhận **semantic
  duplicate**.

  "Semantic duplicate" phải là một phép chiếu cụ thể, không phải một tính từ. Hai statement là trùng ngữ
  nghĩa khi **toàn bộ** projection sau đây bằng nhau:

  ```
  subject digest · source revision · signer repository · signer workflow ·
  predicate type · report digest · policy (kèm digest file ignore) · outcome
  ```

  Những thứ **không** nằm trong phép chiếu, và vì thế khác nhau cũng không sao: run ID, run attempt,
  timestamp, bundle signature bytes, cert serial.

  CONFLICT chỉ khi các statement **đáng tin** khác nhau ở một trong các trường thuộc phép chiếu; đó mới là
  chỗ cần người.

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

Chín witness bắt buộc:

1. Marker khai đủ tám evidence hợp lệ, nhưng một `reportLookup: absent` ⇒ CONFLICT. Self-assertion đã bị đóng.
2. `declaredOutcome: true` mà `findings` có mục ở/trên ngưỡng ⇒ CONFLICT. Verdict được tái lập, không được tin.
3. Hai statement đáng tin **khác outcome** ⇒ CONFLICT; hai bundle khác chữ ký **cùng statement** ⇒ tiếp tục.
   Idempotent không bị luật duplicate làm hỏng.
4. Evidence lookup `error` (5xx) ⇒ UNKNOWN **và** marker lookup vẫn `present`. Lỗi evidence không leo lên
   thành lỗi đọc marker.
5. Evidence-set tồn tại, marker vắng, provenance khớp ⇒ adopt, không CONFLICT. Đường resume sống.
6. Hai lỗi cùng lúc, một retryable một không ⇒ `retryable: false`. Không phụ thuộc thứ tự alphabet.
7. **Finding thứ 101 là `HIGH` có fix, `truncated: true`** ⇒ verdict vẫn fail. Counts đủ để tái lập verdict
   dù danh sách bị cắt.
8. **Evidence-set adopt được về structure/provenance nhưng thiếu attestation của một kind** ⇒ CONFLICT, và
   pipeline **không** ký bổ sung. Không có witness này thì "adopt" là một đường rửa nguồn gốc.
9. **Tag evidence-set bị trỏ sang digest khác giữa verify và promote** ⇒ CONFLICT, không ghi marker.

Thêm: oversize descriptor, SBOM subject mismatch, crash giữa phân trang, và mutation phủ từng guard mới. Số
đo ghi trong commit body, không ghi vào spec.

## 12. Thứ tự commit

1. `contract(ci): decide where evidence lives and how long it lives` — A′ + `release-evidence-set.schema.json`
   (§2), lifecycle, và bốn trạng thái cleanup.
2. `contract(ci): let the decision see the evidence set` — §3, hai top-level lookup (tám → **mười**),
   `evidenceSetLookup` với bốn cặp lookup bên trong, luật adopt/conflict, re-resolve tag trước khi ghi marker.
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
