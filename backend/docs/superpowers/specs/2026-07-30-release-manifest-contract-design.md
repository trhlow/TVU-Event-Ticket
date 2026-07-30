# Release manifest contract, v1 — mục 3a

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3a của Contract v1 (PR A — GHCR publish).

Tiền đề: `observation.schema.json` và `publish-decision.sh` đã hoà giải ở `6a2d312`, và
`contract-agreement.test.sh` (`bed2dcb`) giữ chúng khớp nhau trên 14 fixture.

**3a và 3b là hai phần bắt buộc của cùng một release gate.** Xem
`2026-07-30-evidence-verification-contract-design.md` cho 3b. Ba điều khoản không được vi phạm:

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

3b (spec riêng, viết cùng hôm nay, triển khai sau khi 3a xanh): `evidenceVerification` ngoài `content`,
schema của ba custom Trivy predicate, và cách xác minh evidence thật.

Ngoài phạm vi cả 3a và 3b:

- **Collector** (mục 5). Spec này chỉ nói collector *phải khai* những gì.
- **Job `publish` trong `ci.yml`** (mục 6).
- **Hình dạng 8 tên `queriedRef`.** Vẫn chỉ ràng "đúng registry/repository". Fixtures giả định
  `:release-<sha>`, `:prepared-<sha>`, `:candidate-{monolith,frontend}-<sha>`. Chốt cùng commit collector.
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
| `subject` | **phải vắng** |
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

1. Push canonical payload blob.
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
| `evidence.*.passed` | `boolean` (§4) | `const: true` |
| `flywayInventory.migrations[].success` | `boolean` (§4) | `const: true` |

Không siết `environment`, `migration.type`, `migration.script`: producer đọc chúng từ history thật, và
đoán hình dạng ở đây tạo ra chỗ mà một release đúng bị chặn.

Observer phải rộng vì registry có thể chứa rác; producer thì không được tự phát minh predicate.

## 4. Kết luận xác minh: `boolean`, và hai trust boundary

Nguyên tắc: **`false` là một phép xác minh đã hoàn tất và phát hiện mâu thuẫn ⇒ CONFLICT. Chỉ khi không
hoàn tất được phép xác minh mới là UNKNOWN.**

Thiếu field và sai kiểu thì phụ thuộc **nguồn của dữ liệu**, vì đó là hai trust boundary khác nhau:

| Nguồn | `false` | Thiếu / sai kiểu |
|---|---|---|
| Collector tự tạo (`attestationVerified`, `policyPassed`, `digestVerified`, `sizeVerified`) | CONFLICT | **UNKNOWN** |
| Đọc từ marker payload (`evidence.*.passed`, `migrations[].success`) | CONFLICT | **CONFLICT** |

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
5. `evidence.<kind>.<image>.passed`
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

`presentMarker` thêm một object, thay cho `payloadDescriptor` phẳng của bản trước:

```
ociEnvelope: {
  schemaVersion, mediaType, artifactType, configDescriptor, subject,
  layerCount, payloadDescriptor, annotationsAbsent, digestVerified, sizeVerified
}
```

- `artifactType`: `["string", "null"]`.
- `subject`: `null` khi vắng; object khi có (và khi có là CONFLICT).
- `layerCount`: integer ≥ 0.
- `payloadDescriptor`: `object | null` — **null** khi `layerCount != 1`, vì lúc đó không có layer nào để
  mô tả, hoặc không rõ đang mô tả layer nào.
- `annotationsAbsent`: `boolean` — ba cấp, một kết luận. Raw annotations không cần lưu, nhưng policy phải
  executable, và `false` là CONFLICT.

`artifactType` khai `["string","null"]` **có chủ đích**: `null` là *một lời khai* — "object trong registry
không có `artifactType`", hoàn toàn hợp lệ trong OCI vì nó là field optional. Thiếu key là *không khai
được*. Cùng hình dạng `skipped.queriedRef: null`.

Observation **không** đặt `const` lên `artifactType`: nó phải mô tả được một object sai kiểu. `const` chỉ
sống trong `release-envelope.schema.json` và như một hằng trong decision.

| Observation | Kết quả |
|---|---|
| thiếu key `artifactType` (hoặc bất kỳ key collector-derived nào) | UNKNOWN |
| `artifactType: null` | CONFLICT |
| `artifactType` là string khác hằng | CONFLICT |
| `subject` không null | CONFLICT |
| `layerCount != 1` | CONFLICT |
| `annotationsAbsent: false` | CONFLICT |
| `schemaVersion`, `mediaType`, `configDescriptor` lệch hằng | CONFLICT |
| `digestVerified` hoặc `sizeVerified` là `false` | CONFLICT |
| tất cả khớp | tiếp tục |
| `ociEnvelope` trên lookup không phải marker | UNKNOWN — tự rơi ra từ §6 |

### `content` là conditional, không phải bắt buộc

Đây là mâu thuẫn cứng của bản trước: §2 cấm parse JSON trước khi descriptor khớp, nhưng `presentMarker`
bắt `content` vô điều kiện, nên `digestVerified: false` là trạng thái **không thể khai** — cùng hình dạng
vụ `skipped` phải mang `queriedRef: null` mà script cũ lại cấm khoá đó.

Luật:

- `digestVerified && sizeVerified && layerCount == 1` ⇒ `content` **bắt buộc**.
- Ngược lại ⇒ `content` **bị cấm**, observation vẫn structurally valid, decision trả **CONFLICT**.
- Không tải hoặc không băm được ⇒ lookup khai `status: "error"` ⇒ UNKNOWN.

Cơ chế: `if`/`then`/`else` trong `presentMarker`. Lưu ý `content` vẫn phải nằm trong `properties` để
`additionalProperties: false` cho phép nó tồn tại ở nhánh `then`; nhánh `else` dùng
`"not": { "required": ["content"] }`.

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

`ociEnvelope` vào cột Marker ở commit 4, không sớm hơn — commit 1 không được tham chiếu tới field chưa
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
schema của một object thật (`ociEnvelope`), không phải một file metadata. Observation `$ref` sang nó để
lấy shape; decision đọc hằng từ nó; `manifest-agreement.test.sh` đòi ba nguồn khớp nhau.

Chống sai, không chỉ chống drift:

1. Workflow **bắt buộc** sinh SPDX 2.3 — không để action tự suy diễn giữa SPDX và CycloneDX.
2. Lượt publish thật đầu tiên đọc ngược `predicateType` từ attestation và đối chiếu hằng.
3. Sai hằng thì **fail trước promote**. Tuyệt đối không "học" từ output rồi tự cập nhật hằng — một
   pipeline tự sửa kỳ vọng theo thứ nó quan sát được thì không còn kiểm gì nữa.
4. Sau lượt đó, lưu output đã rút gọn thành fixture, chuyển trạng thái sang verified-on-runner.

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

1. `fix(ci): give each kind of lookup its own field set` — §6, **chỉ theo shape hiện có**, không chạm
   carrier. Kèm 2 fixture. Độc lập, sửa một lệch đang sống.
2. `contract(ci): let the observation state a negative verdict` — §4, **bốn** boolean đang tồn tại
   (`attestationVerified`, `policyPassed`, `evidence.*.passed`, `migrations[].success`) + sửa mô tả Flyway
   ở `:237`. `digestVerified`/`sizeVerified` chưa tồn tại nên chưa nằm ở đây.
3. `contract(ci): freeze the release manifest as a schema` — `release-manifest.schema.json`,
   `manifest-agreement.test.sh`, release-manifest fixtures, nối vào `ci.yml`. **Phải đồng thời thêm
   enforcement predicate exact vào decision, test và mutations** — không có nó, fixture predicate sai
   không thể ra CONFLICT và điều 2 của §9 vô nghĩa.
4. `contract(ci): name the carrier the marker travels in` — `release-envelope.schema.json`, `ociEnvelope`
   vào `presentMarker`, `digestVerified`/`sizeVerified`/`annotationsAbsent`, nhánh conditional của
   `content`, hằng vào decision, 9 marker instance trong 8 fixture mỗi cái thêm envelope.

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
