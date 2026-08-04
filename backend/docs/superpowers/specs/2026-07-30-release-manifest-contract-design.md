# Release manifest contract, v1 — mục 3a

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3a của Contract v1 (PR A — GHCR publish).

Tiền đề: `observation.schema.json` và `publish-decision.sh` đã hoà giải ở `6a2d312`, và
`contract-agreement.test.sh` (`bed2dcb`) giữ chúng khớp nhau trên bộ fixture — 14 cái khi spec này viết,
**21 cái tính đến 2026-08-04** (3 valid, 8 invalid-structure, 10 invalid-semantics).

**3a và 3b là hai phần bắt buộc của cùng một release gate.** Xem
`2026-07-30-evidence-verification-contract-design.md` cho 3b.

Thứ tự thi công là **3a commit 0-4 → 5a → 5b-i → 5b-ii → 5b → 3b → 3a commit 6**, không phải "3b sau khi 3a xanh" như
bản đầu viết: commit đóng băng payload phải chờ shape evidence của 3b. Xem §10.

> Dòng trên từng ghi "3a commit 0-4 → 3b → 3a commit 5", đúng với lúc viết nhưng sai sau ngày
> 2026-07-31, khi §7a được chèn thành commit 4 và đẩy số của hai commit sau nó. Sửa 2026-08-04, cùng lượt
> với lỗi y hệt trong spec 3b. Đây là lý do commit 5 tách đôi bằng hậu tố chữ cái chứ không đánh lại số
> — xem §5.1.

Ba điều khoản không được vi phạm:

- 3a **không** được dùng để tuyên bố evidence đã đáng tin.
- **Không merge và không enable job publish khi chỉ có 3a.**
- **Collector (mục 5) không được bắt đầu trước khi schema 3b đóng băng.**

## 1. Phạm vi

3a:

- `.github/contracts/release-manifest.schema.json` — payload mà job publish được phép viết.
- `.github/contracts/release-envelope.schema.json` — OCI envelope chở nó, và nhà của các hằng
  không thuộc payload.
- Ba sửa lỗi trong hợp đồng đang có: tách field set theo loại lookup, `ociEnvelope` trong observation,
  và các trường kết luận đổi từ `const: true` thành `boolean`.
- Năm hằng predicate URI, một nguồn duy nhất.
- `manifest-agreement.test.sh`, nối vào `ci.yml` trong cùng commit tạo nó.

3b (spec riêng, viết cùng hôm nay, thi công **giữa** commit 5b và commit 6 của 3a): evidence-set, xác
minh evidence, và schema của ba custom Trivy predicate.

> **Payload không được đóng băng trước 3b.** Phương án A′ của 3b (evidence-set có manifest và tag neo giữ)
> đổi hình dạng `evidence` bên trong 7 key: mỗi entry mang descriptor `{mediaType,digest,size}` thay cho
> một digest trơ, payload mang thêm `evidenceSetDigest` cho mỗi image, và entry SBOM khác hình dạng ba
> entry scan. Vì vậy `release-manifest.schema.json` là commit **cuối** của 3a, sau khi shape evidence của
> 3b final — xem §10. Ba sửa lỗi độc lập của 3a không chờ điều đó.

Ngoài phạm vi cả 3a và 3b:

- **Collector** (mục 5). Spec này chỉ nói collector *phải khai* những gì.
- **Job `publish` trong `ci.yml`** (mục 6).
- **Hình dạng của từng tên `queriedRef`.** Sau commit 4 (§7a) mỗi lookup đã bị pin vào **đúng repository**
  của nó, nên nửa "trỏ vào đâu" của nợ này đã trả. Nửa còn lại — hình dạng tag — vẫn hoãn: fixtures giả
  định `:release-<sha>`, `:prepared-<sha>`, `:candidate-{monolith,frontend}-<sha>`,
  `:evidence-{monolith,frontend}-sha-<sha>`. Chốt cùng commit collector. Số lookup là **mười** sau 3b, không
  còn tám.
- **H10.** Chỉ đóng sau một lượt deploy thật kèm rollback drill — rollback image **không** đảo Flyway
  migration, nên "rollback được" phải được chứng minh chứ không suy ra.

## 2. OCI envelope

`markerDigest` là digest của **OCI image manifest**, không phải của payload JSON. Attestation phủ lên
manifest digest đó, nên `verification.subjectDigest == markerDigest` (đã đúng sẵn).

Mọi lựa chọn mà OCI để optional đều bị đóng băng ở đây. Không đóng băng thì nhiều envelope hợp lệ mang
digest khác nhau, và cùng một SHA không tái tạo được cùng một artifact.

| Thành phần | Giá trị bắt buộc |
|---|---|
| `schemaVersion` | `2` |
| manifest `mediaType` | `application/vnd.oci.image.manifest.v1+json` |
| manifest `artifactType` | `application/vnd.tvu.release-manifest.v1+json` |
| `config.mediaType` | `application/vnd.oci.empty.v1+json` |
| `config.digest` | `sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` |
| `config.size` | `2` |
| `config.data` | `"e30="` — **bắt buộc**, vì OCI để nó optional |
| `config` field set | đúng `mediaType`, `digest`, `size`, `data`, không gì khác |
| `layers` | **đúng một** descriptor |
| layer `mediaType` | `application/vnd.tvu.release-manifest.v1+json` |
| layer field set | đúng `mediaType`, `digest`, `size`, không gì khác |
| `subject` | **phải vắng** — xem ghi chú dưới, đây là luật của **marker**, không phải luật chung |
| `annotations` | **key phải vắng hoàn toàn**, ở cả ba cấp: manifest, config descriptor, layer descriptor |

### Annotations: cấm, và cấm bằng cách vắng key

Không phải "object rỗng hoặc vắng" — hai representation đó cho ra manifest bytes khác nhau và digest
khác nhau. Quy tắc là **key `annotations` không xuất hiện**.

Cấm ở cả ba cấp, không chỉ ở manifest: `oras push FILE` thường tạo layer annotation
`org.opencontainers.image.title`, và output ORAS chính thức còn cho thấy manifest annotation
`org.opencontainers.image.created`. CLI hiện **không có** cờ `--disable-annotations`, nên spec này
không được viết "workflow tắt annotation mặc định bằng flag" — cờ đó không tồn tại.

`org.opencontainers.image.revision` cũng không được phép: commit đã có mặt ở payload `commit`, ở SLSA
provenance, và ở tag `sha-<commit>`. Bản sao thứ tư chỉ thêm một đường drift.

Thủ tục producer bắt buộc, vì `oras push` không dựng được envelope này:

1. Push canonical payload blob, **và push cả blob `{}` của empty config**. Registry được phép từ chối một
   manifest tham chiếu blob chưa tồn tại, nên không được dựa vào `data` embedded một mình. Nếu muốn bỏ
   bước push blob `{}` thì phải có integration test GHCR chứng minh descriptor `data` được chấp nhận —
   không suy ra từ spec OCI.
2. **Tự dựng** canonical OCI manifest JSON theo bảng trên.
3. Push nó bằng `oras manifest push` (nhận manifest đã dựng sẵn, nên phù hợp với envelope chặt).
4. Fetch raw manifest về.
5. Assert `annotations` vắng ở cả ba cấp, và digest đúng như đã tính.
6. **Chỉ sau đó** mới attest và promote.

### Lập luận cũ đã bị bỏ

Bản trước lập luận rằng annotations không cần kiểm vì chúng vào digest và `publish-decision.sh:408` đã
đòi final/prepared cùng `markerDigest`. Lập luận đó **sai**: một artifact được tạo *một lần* với
timestamp ngẫu nhiên rồi re-tag vẫn thỏa bằng thức đó hoàn hảo. Digest equality chỉ chứng minh hai tag
trỏ cùng một object; nó không chứng minh gì về việc producer có tuân policy. Envelope policy phải
executable.

Bất biến vẫn giữ, nhưng vì lý do khác: **tạo artifact một lần, re-tag cùng digest, không rebuild final
marker** — để promotion không phải là một lần dựng lại có thể khác đi.

### `subject` vắng là luật của marker, không phải luật chung

Evidence-set artifact của 3b **có** `subject` = digest của image mà nó nói về. Hai luật ngược nhau trên hai
loại artifact khác nhau, có chủ đích: marker là gốc của release nên nó không treo dưới cái gì; evidence-set
nói *về* một image nên nó treo dưới image đó. Đừng tổng quát hoá luật này sang artifact khác.

Ở cả hai trường hợp, **tag là neo reachability chính**, không phải `subject`: hỗ trợ referrers API của GHCR
không được coi là điều đã biết.

### Thứ tự bắt buộc ở collector

Kiểm `size` trước (chặn tải không giới hạn) → tải bytes → băm → đối chiếu descriptor `digest` → **chỉ khi
cả hai khớp** mới parse JSON. Parse trước khi đối chiếu là tin vào bytes chưa được kiểm.

Đây là hai phép kiểm ở hai thời điểm, không phải một phép kiểm nói hai lần, nên observation khai **cả
hai** `digestVerified` và `sizeVerified`. Tổ hợp `digestVerified: true, sizeVerified: false` không được
coi là bất khả rồi bỏ trống: decision đòi **cả hai** true, mọi tổ hợp khác là CONFLICT.

## 3. Hai schema, subset **by construction**

`release-manifest.schema.json` **không** sao chép cấu trúc của `markerContent`:

```json
{
  "$id": "https://github.com/trhlow/TVU-Event-Ticket/.github/contracts/release-manifest.schema.json",
  "allOf": [
    { "$ref": "./observation.schema.json#/$defs/markerContent" },
    { "...": "các const nghiêm ngặt hơn" }
  ]
}
```

Mọi manifest hợp lệ **bắt buộc** hợp lệ theo `markerContent`, không phụ thuộc có bao nhiêu fixture.
Fixture là witness và regression; chúng không bao giờ chứng minh được một quan hệ tập hợp.

Hai bẫy cơ chế:

- `additionalProperties: false` trong `markerContent` chỉ soi `properties` của **chính nó**, nên `allOf`
  chỉ compose đúng khi nhánh thứ hai **siết key đã có** và không thêm key mới. Ở đây đó là tính năng: nó
  làm việc thêm field phân biệt prepared/final trở thành bất khả về cấu trúc.
- `$id` là URL, nên `./observation.schema.json` resolve thành https URL. Test **phải** nạp cả hai schema
  vào `referencing.Registry` theo `$id`, với retrieve function **raise**. Mạng không phải fallback: một
  test âm thầm tải schema từ `main` sẽ xanh trong khi đang kiểm sai file.

### Manifest siết chặt hơn ở đâu

| Trường | `markerContent` (observer) | manifest (producer) |
|---|---|---|
| `evidence.sbom.*.predicateType` | non-empty string | `const` SPDX URI |
| `evidence.vulnerabilityScan.*.predicateType` | non-empty string | `const` Trivy vuln URI |
| `evidence.layerSecretScan.*.predicateType` | non-empty string | `const` Trivy layer-secret URI |
| `evidence.filesystemSecretScan.*.predicateType` | non-empty string | `const` Trivy fs-secret URI |
| `evidence.{vulnerabilityScan,layerSecretScan,filesystemSecretScan}.*.passed` | `boolean` (§4) | `const: true` |
| `evidence.sbom.*.documentValidated` | `boolean` (§4) | `const: true` |
| `flywayInventory.migrations[].success` | `boolean` (§4) | `const: true` |

`evidence.sbom` **không có** `passed`: SPDX phát biểu một inventory, không phát biểu verdict, nên hỏi nó
"passed hay không" là phát minh câu trả lời. Xem 3b §4. Ba entry scan giữ `passed`.

Không siết `environment`, `migration.type`, `migration.script`: producer đọc chúng từ history thật, và
đoán hình dạng ở đây tạo ra chỗ mà một release đúng bị chặn.

Observer phải rộng vì registry có thể chứa rác; producer thì không được tự phát minh predicate.

### Canonicalizer dùng chung, và nó **không** phải JCS

"Canonical payload" và "canonical manifest" phải là một thuật toán executable, không phải một tính từ. Nếu
không, cùng một SHA cho ra digest khác sau một lần rerun và bất biến "tạo một lần, re-tag" mất nghĩa.

Một canonicalizer duy nhất, dùng cho payload marker, manifest OCI tự dựng, và report của 3b. Nó **là**
dạng đang có trong `publish-decision.sh:367`:

```python
json.dumps(value, sort_keys=True, separators=(",", ":"))  # UTF-8, không newline cuối
```

Đề xuất **không** chuyển sang JCS (RFC 8785), dù JCS là thứ đúng theo chuẩn: `flywayInventory.checksum`
trong các fixture hiện có đã được tính bằng dạng trên, và JCS mã hoá số cùng escape unicode khác đi, nên
đổi sẽ làm mọi checksum fixture sai và phải tính lại. Rẻ hơn và ít rủi ro hơn: **trích dạng đang có ra một
hàm dùng chung, ghi rõ luật, và ghi rõ nó không phải JCS** để không ai giả định lẫn.

Ghi `json.dumps(..., sort_keys=True, separators=(",", ":"))` là **chưa đủ**: Python mặc định
`ensure_ascii=True` và mặc định **cho phép** `NaN`/`Infinity`, còn `json.loads` mặc định **im lặng nhận**
key trùng và lấy giá trị cuối. Cả ba đều phải bị khoá tường minh:

| Tham số | Giá trị | Vì sao |
|---|---|---|
| `ensure_ascii` | **`True`** | Chính là mặc định mà `flywayInventory.checksum` trong fixture đã được tính bằng. Đây là hệ quả trực tiếp của việc không dùng JCS — JCS thì ngược lại, không escape. |
| `allow_nan` | **`False`** | `NaN`/`Infinity` không phải JSON. Cho phép chúng là phát hành một tài liệu mà parser khác từ chối. |
| `sort_keys` | `True` | Theo code point. |
| `separators` | `(",", ":")` | Không khoảng trắng. |
| newline cuối | không có | |
| encode | UTF-8, không BOM | |
| duplicate key khi **đọc** | **từ chối** | `no_duplicates` ở `publish-decision.sh:79` đã làm đúng việc này cho observation; canonicalizer phải dùng cùng `object_pairs_hook`. |
| miền kiểu | chỉ object, array, string, integer, boolean, null | Float bị cấm: không có cách viết float canonical mà hai runtime đồng ý. `migration.checksum` là integer, nên không cần float ở đâu cả. |

Thứ tự `findings` của 3b do schema quy định, không do scanner quyết.

Kèm **golden bytes + golden digest fixture**: một document mẫu chứa ký tự non-ASCII và số lớn, bytes mong
đợi, digest mong đợi. Không có fixture đó thì canonicalizer là một lời hứa.

## 4. Kết luận xác minh: `boolean`, và hai trust boundary

Nguyên tắc: **`false` là một phép xác minh đã hoàn tất và phát hiện mâu thuẫn ⇒ CONFLICT. Chỉ khi không
hoàn tất được phép xác minh mới là UNKNOWN.**

Thiếu field và sai kiểu thì phụ thuộc **nguồn của dữ liệu**, vì đó là hai trust boundary khác nhau:

| Nguồn | `false` | Thiếu / sai kiểu |
|---|---|---|
| Collector tự tạo (`attestationVerified`, `policyPassed`, `digestVerified`, `sizeVerified`) | CONFLICT | **UNKNOWN** |
| Đọc từ marker payload (`evidence.<scan>.*.passed`, `evidence.sbom.*.documentValidated`, `migrations[].success`) | CONFLICT | **CONFLICT** |

Thu thập lại sửa được một collector khai thiếu. Nó không sửa được một marker malformed đang nằm trong
registry.

| Tình huống | Kết quả |
|---|---|
| timeout, lỗi mạng, 401/403/429/5xx, verifier crash, output hỏng | UNKNOWN (khai `status: "error"`) |
| tải đủ bytes, băm xong, lệch descriptor `digest` hoặc `size` | CONFLICT |
| attestation đọc và kiểm đầy đủ, sai chữ ký / subject / signer / predicate / SHA | CONFLICT |
| evidence artifact bị xoá (lookup hoàn tất, trả absent) | CONFLICT |

Ràng buộc lên collector (mục 5): **không được biến mọi exit code khác 0 của `gh attestation verify`
thành `false`.** Kết luận âm và không thực hiện được phép kiểm là hai điều khác nhau; gộp chúng là gửi
người trực sự cố tới sai chỗ. `false` chỉ được khai khi verifier chạy xong và trả lời "không".

`absent.observedCode: const 404` **không** thuộc lớp này: nó là một sự kiện quan sát, không phải kết luận.

### Cột phải của hàng marker-payload đã đúng trong code; sai trong spec

Bản trước của spec nói thiếu/sai kiểu ở `evidence.*.passed` và `migrations[].success` cho ra UNKNOWN. Đó
là mô tả **sai hành vi đang có**. `expectations.json` ghi:

```
invalid-structure/evidence-missing-layer-secret-scan.json   schema: rejects   state: CONFLICT
invalid-structure/migration-without-installed-rank.json     schema: rejects   state: CONFLICT
```

Lý do: **schema không nằm trong đường chạy của decision.** `publish-decision.sh` tự `validate()`, và với
marker content nó cố tình không siết required/additionalProperties — nó đẩy sang `marker_problems` →
`conflict()`. Suite 17/17 đang chứng minh điều đó. Nên ma trận trên là mô tả, không phải yêu cầu đổi code.

### Ràng buộc mới, và là phần đáng giá nhất của mục này

> **Không được đặt cổng validate-schema trước decision.**

Nếu collector (mục 5) hay job publish (mục 6) validate observation bằng schema rồi fail closed, **mọi**
lỗi marker-payload lật từ CONFLICT sang UNKNOWN, và người trực sự cố bị gửi đi thu thập lại một marker
hỏng. Ràng buộc này phải có test, không chỉ có văn bản.

### Thay đổi thực tế lên observation schema

Sáu trường đổi `const: true` → `"type": "boolean"`:

1. `verification.attestationVerified`
2. `verification.policyPassed`
3. `ociEnvelope.digestVerified`
4. `ociEnvelope.sizeVerified`
5. `evidence.<scan>.<image>.passed` (ba entry scan) và `evidence.sbom.<image>.documentValidated`
6. `flywayInventory.migrations[].success`

`required` và các `pattern` **không** đổi, nên **không fixture nào bị phân loại lại**: hai fixture ở trên
vi phạm `required` chứ không vi phạm `const`, nên chúng vẫn `schema: rejects` + `CONFLICT`. Fixture mới
thêm cho nhánh `false` của từng trường, tất cả `schema: accepts` + `CONFLICT`.

Trường 6 không có trong review ban đầu nhưng cùng hình dạng chính xác: một hàng `flyway_schema_history`
với `success: false` là kết luận âm đã hoàn tất, cần người.

### Sửa một mô tả sai trong schema hiện tại

`observation.schema.json:237` viết "Read from flyway_schema_history inside the candidate monolith image".
Image **không** chứa bảng history, nó chứa script. Mô tả đúng: đọc từ `flyway_schema_history` của một
Postgres tạm **sau khi** candidate image chạy migration; `boundTo` là digest của image đã chạy chúng.

## 5. `ociEnvelope` trong observation

`presentMarker` thêm một object. Bản trước để nó phẳng — `rawEnvelope` cộng các field derived trộn cùng một
cấp — và đó là đúng cái bẫy `additionalProperties: false` mà §3 vừa cảnh báo rồi bước vào. Sửa bằng cách
**lồng raw**, không trộn:

```
ociEnvelope: {
  digestVerified: boolean,     ─┐ luôn có
  sizeVerified:   boolean,     ─┘
  parsed:         boolean,     ─ bytes khớp nhưng có parse được JSON hay không
  raw:            <đúng OCI manifest như bytes trên registry>   ─ conditional
}
```

`raw` là **conditional**, cùng luật đã áp cho `content` và vì cùng một lý do: §2 cấm parse trước khi
descriptor khớp, nên một `raw` tồn tại cạnh `digestVerified: false` là một tài liệu khai thứ nó không được
phép đọc. Đây là bug tôi đã sửa cho `content` ở vòng trước rồi tái tạo lại một cấp thấp hơn.

- `digestVerified && sizeVerified && parsed` ⇒ `raw` **bắt buộc**
- một trong ba là `false` ⇒ `raw` **bị cấm**, observation vẫn valid, decision ⇒ **CONFLICT**
- bytes khớp nhưng không parse được JSON ⇒ `parsed: false`, một kết luận âm riêng ⇒ **CONFLICT** (producer
  phát hành bytes không phải JSON), không phải UNKNOWN
- không tải hoặc không băm được ⇒ lookup khai `status: "error"` ⇒ UNKNOWN

**Chỉ ba boolean.** `layerCount`, `payloadDescriptor` và `annotationsAbsent` của bản trước đều **derive
được từ `raw`** — số layer là `len(raw.layers)`, payload descriptor là layer duy nhất, annotations vắng hay
không thì nhìn thấy ngay trong `raw`. Ba field đó bị bỏ: một field derived được khai riêng là một cơ hội
để hai nửa của cùng một sự thật nói khác nhau, và hợp đồng này đã có một bug đúng loại đó.

Ba boolean còn lại **không** derive được từ `raw`: chúng là kết quả của các phép kiểm ở ngoài manifest.

### `raw` là bytes, nên `null` không có chỗ ở đây

`raw.artifactType` **không** khai `["string","null"]`. `raw` là OCI manifest thật; một manifest không có
`artifactType` thì đơn giản là **vắng key**, và khai `null` là biến bytes thật thành một bản đã diễn giải.
Thủ pháp `null`-là-một-lời-khai đúng cho field *derived* (như `skipped.queriedRef`), sai cho field *raw*.

`raw` phải mô tả được cả manifest **có** `annotations` và **có** `subject`: đó là artifact xấu mà decision
phải từ chối, không phải artifact observation được phép im lặng.

### `raw` phải chứng minh được nó là chính bytes đó

Decision kiểm thêm:

```
sha256(canonical_bytes(raw)) == markerDigest
```

Không có phép kiểm này, `raw` chỉ là một bản đánh máy lại và một envelope **không canonical** vẫn đi qua —
đúng thứ mà §2 tồn tại để chặn. Kéo theo hai điều: collector phải giữ `raw` **không mất mát** (nên
`strict_loads` từ chối key trùng là bắt buộc, không phải tuỳ chọn), và **canonicalizer là điều kiện tiên
quyết của carrier** — vì thế commit 3 đứng trước commit 5 trong §10.

Observation **không** đặt `const` lên các trường của `raw`: nó phải mô tả được một object sai kiểu. `const`
chỉ sống trong `release-envelope.schema.json` (`$defs/constants`) và như hằng trong decision.

| Observation | Kết quả |
|---|---|
| thiếu `ociEnvelope`, thiếu `digestVerified`/`sizeVerified`/`parsed`, hoặc sai kiểu | UNKNOWN |
| `raw` có mặt khi một trong ba boolean là `false`, hoặc vắng khi cả ba `true` | UNKNOWN — observation tự mâu thuẫn |
| `parsed: false` | CONFLICT |
| `sha256(canonical_bytes(raw)) != markerDigest` | CONFLICT |
| `raw` vắng key `artifactType` | CONFLICT |
| `raw.artifactType` là string khác hằng | CONFLICT |
| `raw.subject` có mặt | CONFLICT |
| `raw.annotations` có mặt ở bất kỳ cấp nào trong ba cấp | CONFLICT |
| `len(raw.layers) != 1` | CONFLICT |
| `raw.schemaVersion`, `raw.mediaType`, `raw.config` lệch hằng | CONFLICT |
| `digestVerified` hoặc `sizeVerified` là `false` | CONFLICT |
| tất cả khớp | tiếp tục |
| `ociEnvelope` trên lookup không phải marker | UNKNOWN — tự rơi ra từ §6 |

### `content` là conditional, không phải bắt buộc

Đây là mâu thuẫn cứng của bản trước: §2 cấm parse JSON trước khi descriptor khớp, nhưng `presentMarker`
bắt `content` vô điều kiện, nên `digestVerified: false` là trạng thái **không thể khai** — cùng hình dạng
vụ `skipped` phải mang `queriedRef: null` mà script cũ lại cấm khoá đó.

Luật:

- `digestVerified && sizeVerified && len(raw.layers) == 1` ⇒ `content` **bắt buộc**.
- Ngược lại ⇒ `content` **bị cấm**, observation vẫn structurally valid, decision trả **CONFLICT**.
- Không tải hoặc không băm được ⇒ lookup khai `status: "error"` ⇒ UNKNOWN.

`evidenceVerification` của 3b theo **đúng cùng điều kiện**: bắt buộc khi `content` bắt buộc, bị cấm khi
`content` bị cấm. Không đối xứng thì một envelope sai digest cộng với `evidenceVerification` vắng sẽ ra
UNKNOWN, trong khi nó phải là CONFLICT — bytes đã được kiểm và đã trượt.

Cơ chế: `if`/`then`/`else` trong `presentMarker`. Lưu ý `content` vẫn phải nằm trong `properties` để
`additionalProperties: false` cho phép nó tồn tại ở nhánh `then`; nhánh `else` dùng
`"not": { "required": ["content"] }`.

### 5.1 Commit 5 tách đôi thành 5a và 5b

Chốt 2026-08-04. **5a — cơ chế:** ba boolean, `raw` conditional, phép kiểm
`sha256(canonical_bytes(raw)) == markerDigest`, `content` chuyển sang conditional, và sinh lại mọi
`markerDigest` trong fixture. Ở 5a, `raw` được mô tả như một OCI manifest **bất kỳ**; decision chưa phán
xét hình dạng của nó. **5b — hằng:** `release-envelope.schema.json` với bốn `$defs`, tám guard hình dạng
của §2, và `manifest-agreement.test.sh` nối vào `ci.yml` trong cùng commit tạo ra nó.

Ranh giới đặt đúng chỗ đó vì sau 5a hợp đồng đã chứng minh được **`raw` là chính bytes đó**. Tám guard
của 5b chỉ có nghĩa khi tiền đề ấy đã đứng, và — quan trọng hơn — chúng cần cơ chế sinh digest của 5a để
mỗi witness chỉ vi phạm đúng một luật (§5.2).

Đánh **5a/5b**, không đánh lại thành 5/6/7. Commit đóng băng payload giữ nguyên số **6**. Ngày 2026-07-31
việc chèn §7a thành commit 4 đã đẩy số của hai commit sau nó và spec 3b không được cập nhật theo, sinh ra
đúng một lỗi đánh số phải đi sửa ngày 2026-08-04. Hậu tố chữ cái làm việc chèn không lan ra ngoài.

### 5.2 Mỗi witness phải tự tính lại `markerDigest`

Đây là ràng buộc nặng nhất của commit 5 và là lý do nó tách đôi.

Tám dòng trong bảng §5 nói về **hình dạng** của `raw`: thiếu `artifactType`, `artifactType` sai hằng, có
`subject`, có `annotations` ở bất kỳ cấp nào trong ba cấp, `len(layers) != 1`, lệch `schemaVersion`,
lệch `mediaType`, lệch `config`. Một dòng khác là `sha256(canonical_bytes(raw)) != markerDigest`.

Mọi thay đổi lên `raw` đều làm đổi `sha256(canonical_bytes(raw))`. Một witness thêm `subject` vào `raw`
vì thế **đồng thời** phá vỡ đẳng thức digest, và cả hai guard đều trả CONFLICT. Xóa guard `subject` đi,
witness vẫn xanh — nó đạt CONFLICT qua đường digest. Nhân lên tám lần là **tám guard rỗng trong một
commit**, so với một guard rỗng đã tốn một vòng review ở commit 4.

Đảo thứ tự kiểm **không** cứu được. Nếu kiểm hình dạng trước digest, xóa guard `subject` thì observation
rơi xuống guard digest, vẫn CONFLICT, witness vẫn xanh. Thứ tự chỉ đổi *lý do*, không đổi *verdict*, mà
suite so verdict. Điều duy nhất cứu được là làm witness chỉ vi phạm một luật.

**Luật: mỗi witness mang `markerDigest` tính từ chính `raw` của nó.** Khi đó đẳng thức digest đúng, và
thứ duy nhất còn có thể từ chối observation là guard đang được kiểm. Suite tính tại runtime qua helper
Python; fixture trên đĩa cần literal nên có script sinh, và `contract-agreement.test.sh` kiểm mỗi fixture
có `markerDigest` khớp `raw` của nó. Không có phép kiểm drift đó thì fixture `invalid-semantics` — vốn đã
CONFLICT vì lý do khác — sẽ trôi digest âm thầm và không ai biết.

### 5.3 Gate của `content` giữ nguyên `len(raw.layers) == 1`

Hai điều kiện cố ý khác nhau: `raw` bắt buộc khi `digestVerified && sizeVerified && parsed`; `content`
bắt buộc khi `digestVerified && sizeVerified && len(raw.layers) == 1`. Phương án đơn giản hơn — cho
`content` dùng chung điều kiện với `raw` và để `len != 1` chỉ ra CONFLICT ở decision — bị loại: với hai
layer thì **không xác định được layer nào là payload**, nên bảo collector parse là bảo nó đoán. Đó đúng
là điều §2 cấm, chỉ ở một cấp thấp hơn.

Điều kiện thứ hai tham chiếu `raw.layers`, thứ chỉ tồn tại khi điều kiện thứ nhất đúng, nên trong schema
nó là một `if` lồng trong một `if`. `parsed: false` ⇒ `raw` vắng ⇒ `raw.layers` không lượng giá được ⇒
nhánh `else` ⇒ `content` bị cấm. Đúng như mong muốn, nhưng phải viết ra vì nó không hiển nhiên.

### 5.4 Mười lăm marker instance, không phải chín

Đo ngày 2026-08-04: `"markerDigest"` xuất hiện **15 lần trong 14 file**. Con số "9 instance / 8 file" của
các bản ghi cũ đã lạc hậu — bộ fixture lớn lên cùng commit 0-4.

Cả 15 hiện dùng chung một placeholder `sha256:3333…3333`. Sau 5a **tất cả đều phải chết**: mỗi cái thành
hash thật, và chúng khác nhau từng cái vì `raw.layers[0].digest` là digest của payload, mà payload mỗi
fixture một khác. Hằng `MARKER_DIGEST` trong `publish-decision.test.sh` cũng mất nghĩa theo.

### 5.5 Một bất biến chuyển từ được-khẳng-định sang tự-đúng

`published.json` mang cả final lẫn prepared marker, và bất biến "tạo artifact một lần, re-tag, không
rebuild final marker" hiện được khẳng định bằng một guard so hai `markerDigest`. Sau 5a nó **tự đúng**:
hai marker cùng `content` ⇒ cùng `raw` ⇒ cùng digest. Guard vẫn giữ, nhưng từ chỗ so hai placeholder
giống nhau nó chuyển sang kiểm một thứ có thật.

**Rủi ro đã chấp nhận, không giấu:** harness test gọi cùng `canonical_bytes` mà decision gọi, nên nếu hàm
đó sai thì cả hai sai giống nhau và test vẫn xanh. Neo độc lập duy nhất là golden bytes + golden digest
dựng ở commit 3, khiến `canonical.test.sh` thành phần móng của cả commit 5 chứ không còn là suite phụ.
Phương án thêm một golden digest cho **một envelope hoàn chỉnh**, tính tay một lần để neo cả đường từ
`raw` tới `markerDigest`, đã được cân nhắc và **loại** ngày 2026-08-04: golden của commit 3 được coi là
đủ. Nếu sau này một bug canonicalizer lọt qua cả hai suite, đây là chỗ để quay lại.

## 6. Tách field set theo loại lookup (bug đang sống)

`publish-decision.sh:149-155` dùng **một** `allowed_fields` cho mọi lookup `present`:
`{status, queriedRef, digest, markerDigest, verification, content}`. Chốt chặn duy nhất là `:182`,
`require("content" not in lookup)` cho Tag/Candidate/DigestObject. Hai đường lệch còn sống sau `6a2d312`:

- tag mang `verification` + `markerDigest` (không mang `content`) → schema `presentObject` từ chối,
  **decision nhận**
- marker mang `digest` → schema `presentMarker` từ chối, **decision nhận**

`contract-agreement.test.sh` không thấy vì không fixture nào chạm tới. Nó chứng minh agreement *trên các
fixture đang có*; nó không chứng minh vắng mặt của lệch. Đây là lý do §3 dựng subset bằng cấu trúc.

Sửa: field set tuyệt đối theo loại lookup, **theo shape hiện có**, chưa có carrier field nào:

| Loại | Field cho phép khi `present` |
|---|---|
| Tag / Candidate / DigestObject | `status`, `queriedRef`, `digest` |
| Marker | `status`, `queriedRef`, `markerDigest`, `verification`, `content` |

`ociEnvelope` vào cột Marker ở commit 5, không sớm hơn — commit 1 không được tham chiếu tới field chưa
tồn tại.

Hai fixture mới đi kèm commit này, mỗi cái một đường lệch trên, cả hai `UNKNOWN`.

## 7. Năm hằng predicate

| Loại | URI |
|---|---|
| marker provenance (`verification.predicateType`) | `https://slsa.dev/provenance/v1` |
| SBOM | `https://spdx.dev/Document/v2.3` |
| vulnerability scan | `https://evts.id.vn/attestations/vulnerabilityScan/v1` |
| layer secret scan | `https://evts.id.vn/attestations/layerSecretScan/v1` |
| filesystem secret scan | `https://evts.id.vn/attestations/filesystemSecretScan/v1` |

Đổi từ `tvu.id.vn` sang `evts.id.vn`: nhóm không kiểm soát `tvu.id.vn`, và một namespace không sở hữu thì
không nên chiếm. `evts.id.vn` đã thuê. Một lượt thay trong fixtures.

Trạng thái URI SPDX: **VERIFIED-UPSTREAM, NOT-YET-EXERCISED-IN-THIS-REPOSITORY.** Tài liệu GitHub dùng
chính giá trị đó để verify SPDX SBOM và attestation của `actions/attest-sbom` mang predicate đó, nên nó
không phải phỏng đoán — nhưng repo này chưa từng chạy trên runner Linux, nên nó cũng chưa phải điều đã
quan sát tại đây. `config.data: "e30="` mang cùng nhãn và cùng kỷ luật.

Ba URI `evts.id.vn` không cần "quan sát trước": workflow chủ động truyền chính các URI đã pin vào
`actions/attest`. Việc runner phải chứng minh là nó thực sự phát hành đúng những URI đó.

**Schema của ba custom predicate là việc của 3b.** Ở 3a chúng chỉ là URI được pin.

### Nhà của các hằng

`release-manifest.schema.json` không thể là nguồn duy nhất cho `artifactType`, layer mediaType và marker
provenance: chúng không thuộc payload 7 key. Chúng sống trong **`release-envelope.schema.json`** — một
schema của object thật, không phải một file metadata. Observation `$ref` sang nó để lấy shape; decision đọc
hằng từ nó; `manifest-agreement.test.sh` đòi ba nguồn khớp nhau.

File đó chia làm **bốn** `$defs`, vì nó đang mô tả ba thứ khác nhau và một tập hằng. (Bản trước viết
"ba" ngay trên một bảng bốn dòng; sửa 2026-08-04.)

| `$defs` | Mô tả |
|---|---|
| `rawEnvelope` | OCI manifest thật, đúng như bytes trên registry. **Rộng**: phải mô tả được cả artifact xấu. Không field derived nào. |
| `markerEnvelope` | **Strict, phía producer.** Exact field set, mọi `const` của §2, `subject` cấm, `annotations` cấm ở ba cấp, đúng một layer. Đây là thứ job publish phải thoả **trước khi** push, và là lý do bảng §2 không còn chỉ là văn bản. |
| `observedEnvelope` | `{ digestVerified, sizeVerified, parsed, raw: rawEnvelope }` — **lồng**, không trộn, để tránh bẫy `additionalProperties: false`. Đây là thứ `presentMarker.ociEnvelope` `$ref` tới. |
| `constants` | `artifactType`, layer mediaType, config descriptor, năm predicate URI. Nguồn duy nhất. |

Không trộn hai cái đầu: một schema vừa validate bytes registry vừa validate observation thì không schema
nào trong hai việc đó còn nói được điều gì chính xác.

### 7b. `$ref` liên file cần máy móc, không chỉ cần cú pháp

Chốt 2026-08-04, sau khi đo. `contract-agreement.test.sh:65` dựng `jsonschema.Draft202012Validator(schema)`
trần. Từ jsonschema 4.18 `RefResolver` đã deprecated và **không** còn tự đọc file cạnh nó, nên một
`$ref: "release-envelope.schema.json#/$defs/observedEnvelope"` ném `Unresolvable` chứ không âm thầm
bỏ qua. Câu "observation `$ref` sang nó" ở trên vì thế không phải một dòng viết thêm — nó là một
`referencing.Registry` phải được dựng. Máy đang có `jsonschema 4.26` và `referencing 0.37`, nên làm được.

Phương án "hai schema độc lập cộng một test so khớp cây con" bị loại: nó để lại **hai bản thật** của cùng
một shape, và chúng chỉ khớp vì một test nói thế. Test đó hỏng thì drift diễn ra im lặng — đúng hình dạng
lỗi mà mục này tồn tại để chặn. Với `$ref` thật, shape chỉ có một bản và không có gì để drift.

Registry đi **trước** và thành commit riêng, kèm hai witness: một `$ref` liên file giải đúng, và một
`$ref` trỏ sai bị báo là lỗi chứ không bị nuốt. Trộn máy móc validator vào cùng commit với tám guard hình
dạng thì RED của hai thứ không phân biệt được — bài học đã trả giá sáu lần.

### 7c. URI trong fixture đang sai bốn trên năm

Đo 2026-08-04: 13 fixture còn mang `tvu.id.vn`, tên miền §7 đã bỏ vì nhóm không sở hữu. Với SBOM thì lệch
hơn cả tên miền — fixture ghi `https://tvu.id.vn/attestations/sbom/v1`, bảng trên ghi
`https://spdx.dev/Document/v2.3`. Bốn trên năm URI không khớp.

Decision chưa ép buộc URI nào (đó là việc của 3b), nên fixture sai không làm hỏng guard nào hôm nay. Nó
vẫn phải sửa, và sửa **thành commit riêng đứng trước 5b**: đổi `predicateType` là đổi `content`, nên mọi
`markerDigest` phải sinh lại, và một lượt quét dữ liệu trộn vào cùng commit với tám guard mới là đúng điều
kiện đã sinh ra sáu lần xanh giả.

**Thứ tự sau khi tách:** 5a (xong) → sweep URI → Registry → 5b.

Chống sai, không chỉ chống drift:

1. Workflow **bắt buộc** sinh SPDX 2.3 — không để action tự suy diễn giữa SPDX và CycloneDX.
2. Lượt publish thật đầu tiên đọc ngược `predicateType` từ attestation và đối chiếu hằng.
3. Sai hằng thì **fail trước promote**. Tuyệt đối không "học" từ output rồi tự cập nhật hằng — một
   pipeline tự sửa kỳ vọng theo thứ nó quan sát được thì không còn kiểm gì nữa.
4. Sau lượt đó, lưu output đã rút gọn thành fixture, chuyển trạng thái sang verified-on-runner.

## 7a. `expected.repository` đang gộp hai thứ khác nhau

`observation.schema.json:24-28` để `expected.repository` vừa là repository **phải ký** marker, vừa là
repository mà **mọi `queriedRef`** phải trỏ vào; `publish-decision.sh:121-132` dựng `scope` từ nó và `:207`
so `signerRepository` với nó. Hai vai trò khác nhau bị gộp vào một khoá.

Hệ quả: bố trí ba package — `monolith`, `frontend`, `release` — **không thể đi qua** contract này, vì ba
package là ba OCI repository khác nhau trong khi source repository chỉ có một.

Tách:

```
expected.sourceRepository            # owner/name trên GitHub, dùng cho signer identity
expected.repositories.release        # nhà của marker và của mọi tag release/prepared
expected.repositories.monolith       # nhà của image monolith và candidate của nó
expected.repositories.frontend       # nhà của image frontend và candidate của nó
```

Mỗi lookup pin vào **đúng** repository của nó, không pin vào một scope chung: `finalMarker` và
`preparedMarker` vào `repositories.release`; `monolithTag`, `monolithDigestObject`, `monolithCandidate` vào
`repositories.monolith`; tương tự cho frontend; và hai `*EvidenceSet` của 3b vào repository của image tương
ứng. `signerRepository` so với `sourceRepository`, không so với repository nào trong ba cái trên.

Đổi này chạm `expected` (đang `additionalProperties: false` với 4 khoá bắt buộc), `publish-decision.sh`, và
cả 14 fixture. Nó **độc lập** với carrier, nên nó đứng riêng ở commit 4 — trước commit 5, để 9 marker
instance không bị sửa hai lượt.

### 7a.1 `schemaVersion` giữ nguyên `1`

Đây là một đổi hình dạng phá vỡ tương thích, và nó **không** bump version. Lý do: chưa có collector nào
tồn tại, nên chưa có gì từng phát ra một observation — version 1 chỉ sống trong fixtures của chính repo
này. Đánh số 2 cho một hình dạng chưa ai đọc biến dãy version thành nhật ký sửa bài của tác giả thay vì
nhật ký các contract đã phát hành.

Điều kiện đóng băng, và nó là bắt buộc chứ không phải khuyến nghị: **ngày commit collector đầu tiên
land, số `1` bị khoá.** Từ thời điểm đó mọi thay đổi hình dạng của observation PHẢI bump, kể cả thêm một
khoá tuỳ chọn. Ai đọc mục này khi đang sửa `expected` mà thấy collector đã tồn tại thì câu trả lời đã có
sẵn: bump.

### 7a.2 Ba OCI repository lồng dưới source repository

`sourceRepository` giữ pattern hai đoạn `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` — một GitHub repository luôn
là `owner/name` và không bao giờ khác.

Ba `repositories.*` dùng `^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$`, tức **hai đoạn trở lên**, và fixtures
dùng `owner/name/{release,monolith,frontend}`. GHCR nhận đường dẫn lồng, nên contract không được cấm
trước một layout mà registry cho phép; đồng thời quan hệ sở hữu đọc được ngay từ chuỗi.

Prefix collision không phát sinh từ việc lồng: guard đòi ký tự ngay sau scope là `:` hoặc `@`, nên
`ghcr.io/owner/name/monolith@sha…` **không** nằm trong scope `ghcr.io/owner/name`. Đó cũng chính là guard
đã có test "a repository whose name merely starts with the expected one".

### 7a.3 Ba repository phải khác nhau đôi một

Nếu hai trong ba trùng giá trị thì việc pin từng lookup vào repository của nó không loại trừ được gì:
một ref trỏ vào package sai vẫn qua guard, và thứ duy nhất còn phân biệt chúng là **hình dạng tag** —
thứ mục "Ngoài phạm vi cả 3a và 3b" ở đầu spec này đã hoãn rõ ràng. Guard khi đó xanh mà rỗng, đúng định
nghĩa fail-open.

JSON Schema draft 2020-12 không diễn đạt được "ba property đặt tên phải khác nhau đôi một", nên luật này
nằm trong decision: vi phạm → `Invalid` → **UNKNOWN, không retryable**. Hệ quả là có thêm một fixture mà
schema chấp nhận còn decision từ chối — cùng loại với bốn fixture của commit 3, và bộ agreement đã biết
cách diễn đạt loại đó.

### 7a.4 Ánh xạ lookup → repository là một bảng tường minh

`LOOKUP_REPOSITORY` liệt kê đủ tám lookup, cùng kiểu với `PRESENT_FIELDS`. Kèm một case trong suite
khẳng định **tập khoá của bảng bằng đúng `REQUIRED_LOOKUPS`**.

Suy ra từ tiền tố tên (`monolith*` → monolith, `frontend*` → frontend, còn lại → release) bị từ chối:
nhánh `còn lại` là một default, và 3b thêm đúng hai lookup `*EvidenceSet` thuộc về repository của image
— chúng sẽ bị pin vào release một cách êm ái. Bảng thiếu khoá mà không có witness thì hỏng theo kiểu tệ
hơn nữa: `KeyError` giữa một quyết định, tức caller đọc stdout nhận số 0 thay vì UNKNOWN — đúng thất bại
mà guard `type(status) is str` đã được viết để chặn.

### 7a.5 Witness và khối lượng

Sáu witness mới: bảng đủ khoá; `monolithTag` trỏ vào repository release; hai repository trùng giá trị;
`sourceRepository` ba đoạn; `repositories.monolith` một đoạn; marker ký bởi `repositories.release` chứ
không phải `sourceRepository`.

Witness cuối là lý do commit 4 tồn tại: trước khi tách khoá nó **không diễn đạt được**, vì hai vai trò
dùng chung một chuỗi nên không có cách nào để chúng khác nhau.

Ba mutation mới — `lookup_repository_ignored`, `repositories_may_coincide`,
`signer_compared_to_release_repository` — và hai mutation cũ (`registry_unchecked`,
`queried_ref_scope_ignored`) phải neo lại vì dòng chúng bám vào đổi.

Khối lượng thật không nằm ở `expected` mà ở **mọi `queriedRef` trong cả 14 fixture**, khoảng tám ref mỗi
file. Bằng chứng đây vẫn là đổi hình dạng chứ không phải đổi hành vi: **không checksum Flyway nào được
xê dịch**, vì chúng băm `migrations` chứ không băm `expected`. Nếu một cái xê dịch thì đó là tín hiệu
việc này đã thôi là đổi hình dạng, và câu trả lời là đi tìm tại sao chứ không phải tính lại fixture.

## 8. Bất biến

1. Tài liệu manifest đúng 7 key. Không `stage`, không timestamp, không tag name, không run number.
   `additionalProperties: false` cộng `allOf`/`$ref` làm việc thêm key trở thành bất khả.
2. `:release-<sha>` và `:prepared-<sha>` là hai tag của **cùng một** OCI manifest digest. Tạo một lần,
   re-tag, không rebuild.
3. Observation schema rộng hơn manifest schema. Observer mô tả được cả artifact xấu; producer không được
   phát hành nó.
4. **Collector xác minh OCI carrier, payload binding và marker provenance. Các evidence reference chưa
   được xác minh độc lập cho đến mục 3b.** Không tài liệu nào tự khẳng định mình đáng tin — và cho đến
   3b, `evidence.*.passed` vẫn là marker tự khai, nên 3a không được dùng để tuyên bố evidence đáng tin.
5. `false` (kết luận âm) ⇒ CONFLICT. Không hoàn tất được phép kiểm ⇒ UNKNOWN. Không bao giờ trộn.
6. Không cổng validate-schema trước decision (§4).
7. Luật ngữ nghĩa liên-trường (`provenance.revision == commit`, `evidence.*.subjectDigest == images.*`,
   `flywayInventory.boundTo == images.monolith`, checksum recompute, unique version / repeatable script)
   ở nguyên trong `marker_problems`. JSON Schema không biểu diễn được chúng, và `invalid-semantics/` là
   bằng chứng viết ra rằng validate schema là chưa đủ.

## 9. Test và fixtures

`manifest-agreement.test.sh` — file riêng, giữ 17/17 của `contract-agreement.test.sh` nguyên vẹn, và
**nối vào `ci.yml` kề dòng 303 trong cùng commit tạo nó**. Một suite không ai chạy thì không kiểm gì.

Fixtures mới ở **`.github/contracts/release-manifest-fixtures/`**, không ở `fixtures/`:
`contract-agreement.test.sh:87-95` `rglob("*.json")` toàn bộ `fixtures/` **và** đòi mỗi file tìm được có
entry trong `expectations.json` — manifest fixture đặt ở đó làm đỏ hai test, không chỉ bị hiểu sai.

Bốn điều được chứng minh, mỗi điều phải chứng minh đỏ được:

1. **Subset là thật** — mọi manifest fixture hợp lệ, nhúng vào observation template ở
   `lookups.finalMarker.content`, được observation schema chấp nhận. (`allOf` bảo đảm điều này về cấu
   trúc; test bắt trường hợp `$ref` resolve sai file hoặc registry nạp thiếu.)
2. **Subset là nghiêm ngặt** — ít nhất một document hợp lệ theo `markerContent` nhưng bị manifest schema
   từ chối (`predicateType` tự phát minh). Không có witness này thì bao hàm là trùng hợp.
3. **Không drift hằng** — `artifactType`, layer mediaType, config descriptor và năm predicate URI khớp
   nhau giữa `release-envelope.schema.json`, `release-manifest.schema.json` và `publish-decision.sh`.
4. **Không cổng schema trước decision** — hai fixture marker-payload mà schema từ chối phải chạy qua đúng
   đường decision và ra CONFLICT, không UNKNOWN.

Fixture predicate sai phải đạt **cả ba** đồng thời: hợp lệ theo observation schema, không hợp lệ theo
manifest schema, decision trả CONFLICT không action.

Mạng bị cấm trong test: registry retrieve function raise.

## 10. Thứ tự commit

Mỗi commit chạy được và tự đứng vững. **Không commit trạng thái đỏ** — TDD cần *quan sát* RED trước khi
sửa, không cần lưu nó lại; bằng chứng RED ghi trong commit body. **Không ghi số test cố định trong spec**:
thêm fixture và guard thì số phải tăng, nên mỗi commit body ghi số thực tế đo được.

0. `fix(ci): let the contract scripts name their interpreter` — `PYTHON_BIN` phủ **tất cả 8 call site trên
   4 file**, không phải hai: `publish-decision.sh:34`, `contract-agreement.test.sh:29`,
   `publish-decision.test.sh:29, :185, :190, :294, :336`, và mutation runner. Mutation runner spawn bash →
   spawn `publish-decision.sh` → `python3`, nên `PYTHON_BIN` phải truyền **qua env**, không chỉ qua argv.
   Kèm: probe fail-fast (interpreter không chạy được thì đỏ ngay với một câu đọc được, không đỏ ở fixture
   thứ 40), và test cho đường interpreter **có khoảng trắng** cùng interpreter không executable. Không có
   commit này thì không chạy được gì trên máy Windows để quan sát RED.
1. `fix(ci): give each kind of lookup its own field set` — §6, **chỉ theo shape hiện có**, không chạm
   carrier. Kèm 2 fixture. Độc lập, sửa một lệch đang sống.
2. `contract(ci): let the observation state a negative verdict` — §4, **bốn** boolean đang tồn tại
   (`attestationVerified`, `policyPassed`, `evidence.*.passed`, `migrations[].success`) + sửa mô tả Flyway
   ở `:237`. `digestVerified`/`sizeVerified` chưa tồn tại nên chưa nằm ở đây.
3. `contract(ci): make canonical a function instead of an adjective` — `canonical_bytes()` và
   `strict_loads()` thành hàm dùng chung với tham số đã khoá (§3), golden bytes + golden digest fixture, và
   **negative test cho từng tham số**: non-ASCII, `NaN`, float, key trùng, BOM, newline cuối. Đứng trước mọi
   thứ nói "canonical", và là tiên quyết của commit 5 vì `raw` được kiểm bằng chính hàm này.
4. `contract(ci): stop one key from naming two different repositories` — §7a.
   `expected.sourceRepository` + `expected.repositories.{release,monolith,frontend}`, mỗi lookup pin vào
   repository của nó, `signerRepository` so với `sourceRepository`. Chạm `expected`, decision, và 14
   fixture. Độc lập với carrier, đứng **trước** commit 5a để 15 marker instance không bị sửa hai lượt.
5a. `contract(ci): make the marker prove it is the bytes it names` — §5.1. `ociEnvelope` =
   `{digestVerified, sizeVerified, parsed, raw}` vào `presentMarker`, nhánh conditional của `raw` **và**
   của `content` (§5.3), phép kiểm `sha256(canonical_bytes(raw)) == markerDigest`, và sinh lại **15
   `markerDigest`** trong 14 fixture (§5.4) — placeholder `sha256:3333…` chết ở đây, cùng hằng
   `MARKER_DIGEST` trong suite. `raw` ở bước này là OCI manifest **bất kỳ**: chưa hằng nào của §2 được áp.
5b-i. `contract(ci): name the attestations with a domain we own` — §7c. `tvu.id.vn` -> `evts.id.vn`
   for the three scan predicates, and SBOM to `https://spdx.dev/Document/v2.3`, across 13 fixtures.
   Changes `content`, so every `markerDigest` regenerates through `fixture-envelopes.py`. No guard.
5b-ii. `contract(ci): let one schema reference another` — §7b. A `referencing.Registry` in
   `contract-agreement.test.sh`, with a witness that a cross-file `$ref` resolves and a witness that a
   broken one is reported rather than swallowed. No envelope constant moves yet.
5b. `contract(ci): name the carrier the marker travels in` — `release-envelope.schema.json` với **bốn**
   `$defs` (§7, gồm `markerEnvelope` strict phía producer), tám guard hình dạng của §2 vào decision, mỗi
   guard một witness tự tính digest theo §5.2.
   `manifest-agreement.test.sh` sinh ra ở đây với hai điều kiểm được ngay (drift hằng envelope, và không
   cổng schema trước decision), nối vào `ci.yml` kề dòng 303 trong **cùng** commit này.

   > Vòng quét retryable ở `publish-decision.sh` từng nằm trong commit này. Đã tách ra và **làm xong**
   > ngày 2026-08-04 (`5a7b4c7`): nó là bug đúng-sai độc lập với carrier, và RED của nó dài một dòng nên
   > sẽ chìm trong RED của một commit đụng 15 marker instance. Luật đã cài: nhiều lỗi thì `retryable` chỉ
   > khi **tất cả** đều retryable.
6. `contract(ci): freeze the release manifest payload as a schema` — **chỉ sau khi 3b xong.**
   `release-manifest.schema.json` (payload đã gồm `evidenceSetDigest` dưới root key `evidence` và descriptor
   cho từng entry), release-manifest fixtures, mở rộng `manifest-agreement.test.sh` cho hai witness subset.
   **Phải đồng thời thêm enforcement predicate exact vào decision, test và mutations** — không có nó, fixture
   predicate sai không thể ra CONFLICT và điều 2 của §9 vô nghĩa.

Commit 0-5b không phụ thuộc 3b. Commit 6 là ranh giới: nó đóng băng payload, nên nó chờ 3b. Thứ tự tổng
thể: **3a 0-4 → 5a → 5b-i → 5b-ii → 5b → 3b 1-7 → 3a 6.**

Commit 0-4 và 5a đã xong (2026-08-04). Số **6** không đổi khi commit 5 tách nhỏ — đó là lý do dùng hậu tố chữ
cái thay vì đánh lại số; xem §5.1.

## 11. Chạy trên Windows

Hai override, và **cả hai cần sửa code**, không chỉ sửa tài liệu: `contract-agreement.test.sh:29` và
`publish-decision.sh:34` gọi thẳng `python3 -`, không có hook nào. `PUBLISH_DECISION_BASH` chỉ chọn bash
cho subprocess (`:39`) và không sửa được `python3` trỏ vào stub WindowsApps.

Thêm `PYTHON_BIN` với cùng lối như `PUBLISH_DECISION_BASH`, rồi chạy từ **gốc repo**, không phải từ
`backend/` — `.github` không nhìn thấy được từ đó:

```powershell
Set-Location (git rev-parse --show-toplevel)
$env:PUBLISH_DECISION_BASH = 'C:/Program Files/Git/bin/bash.exe'
$env:PYTHON_BIN = "$env:LOCALAPPDATA/Programs/Python/Python312/python.exe"
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/manifest-agreement.test.sh
```

`bash` trên PATH là bash của WSL và không tới được interpreter đang chạy.

## 12. Ghi chú về GitNexus

GitNexus không mô hình hóa shell script và JSON Schema, nên `impact` trên các file này trả Low/0 flow.
Kết quả đó **không** là bằng chứng an toàn cho hợp đồng này và sẽ không được trình bày như vậy.
`detect_changes()` vẫn chạy trước mỗi commit theo CLAUDE.md, nhưng luận cứ an toàn là các suite, mutation
và fixture ở trên.
