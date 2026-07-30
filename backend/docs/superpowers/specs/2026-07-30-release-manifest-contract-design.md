# Release manifest contract, v1

Ngày: 2026-07-30. Nhánh: `ci/ghcr-publish`. Mục 3 của Contract v1 (PR A — GHCR publish).

Tiền đề: `observation.schema.json` và `publish-decision.sh` đã được hoà giải ở `6a2d312`, và
`contract-agreement.test.sh` (`bed2dcb`) giữ chúng khớp nhau trên 14 fixture. Spec này thêm nửa
còn lại của hợp đồng — nửa phía **producer** — và sửa ba chỗ lệch mà quá trình thiết kế nó phát hiện.

## 1. Phạm vi

Trong phạm vi:

- `.github/contracts/release-manifest.schema.json` — tài liệu mà job publish được phép viết.
- Định nghĩa OCI envelope chứa nó: `artifactType`, config, đúng một payload layer.
- Bốn hằng predicate URI, một nguồn duy nhất.
- Ba sửa lỗi trong hợp đồng đang có: tách field set theo loại lookup, `artifactType` trong
  observation, và các trường kết luận xác minh đổi từ `const: true` thành `boolean`.
- `manifest-agreement.test.sh` — chứng minh hai schema còn khớp và decision còn khớp cả hai.

Ngoài phạm vi, có chủ đích:

- **Collector** (mục 5). Spec này chỉ nói collector *phải khai* những gì, không nói nó lấy bằng cách nào.
- **Job `publish` trong `ci.yml`** (mục 6).
- **Hình dạng 8 tên `queriedRef`.** Vẫn chỉ ràng "đúng registry/repository". Fixtures giả định
  `:release-<sha>`, `:prepared-<sha>`, `:candidate-{monolith,frontend}-<sha>`. Chốt cùng commit collector.
- **H10.** Kể cả khi PR A/C/B xong, H10 chỉ đóng sau một lượt deploy thật kèm rollback drill — rollback
  image **không** đảo Flyway migration, nên "rollback được" phải được chứng minh chứ không suy ra.

## 2. OCI envelope

`markerDigest` là digest của **OCI image manifest**, không phải của payload JSON. Attestation phủ lên
manifest digest đó, nên `verification.subjectDigest == markerDigest` (đã đúng sẵn).

Envelope v1:

| Thành phần | Giá trị bắt buộc |
|---|---|
| manifest `mediaType` | `application/vnd.oci.image.manifest.v1+json` |
| manifest `artifactType` | `application/vnd.tvu.release-manifest.v1+json` |
| `config` | `application/vnd.oci.empty.v1+json`, digest `sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`, size 2 |
| `layers` | **đúng một** descriptor, `mediaType` = `application/vnd.tvu.release-manifest.v1+json` |

Payload JSON là nội dung của layer duy nhất đó. Evidence (SBOM, scan) **không** nằm trong artifact —
manifest chỉ tham chiếu chúng bằng digest, nên không có layer thứ hai và không có câu hỏi về thứ tự
layer. Hệ quả: một trusted-root snapshot không có chỗ tồn tại trong artifact v1, nên không cần điều
khoản "đừng dùng nó làm trust anchor" cho một layer mà schema không cho phép. Nếu v2 muốn lưu nó, nó
là bằng chứng lưu trữ và trust anchor vẫn phải đến từ bên ngoài artifact.

Thứ tự bắt buộc ở collector: **tải bytes → băm → đối chiếu descriptor `digest` và `size` → chỉ khi khớp
mới parse JSON.** Parse trước khi đối chiếu là tin vào bytes chưa được kiểm.

### Annotations không cần trường quan sát riêng

`annotations`, `config` và layer descriptor đều vào digest của manifest. Một annotation biến thiên theo
lượt chạy (ví dụ `org.opencontainers.image.created`) sẽ làm digest đổi, và `publish-decision.sh:408`
đã đòi `finalMarker.markerDigest == preparedMarker.markerDigest`. Nên bất biến sau đủ để chặn, không
cần thêm field nào vào observation:

> **Tạo artifact một lần, rồi re-tag cùng digest. Không bao giờ rebuild final marker.**

Producer-side quy tắc: không annotation nào biến thiên theo lượt chạy. `org.opencontainers.image.revision`
= commit được phép vì nó hằng theo commit.

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

Mọi manifest hợp lệ **bắt buộc** hợp lệ theo `markerContent`, không phụ thuộc vào việc có bao nhiêu
fixture. Fixture chỉ còn nhiệm vụ làm witness và chống regression — chúng không bao giờ chứng minh được
một quan hệ tập hợp.

Hai điểm cơ chế, cả hai đều là bẫy thật:

- `additionalProperties: false` trong `markerContent` chỉ soi `properties` của **chính nó**. Nên `allOf`
  chỉ compose đúng khi nhánh thứ hai **siết key đã có** và không thêm key mới. Ở đây đó là tính năng:
  nó biến "manifest không được thêm field phân biệt prepared/final" từ một comment thành điều bất khả
  về cấu trúc.
- `$id` là URL, nên `./observation.schema.json` resolve thành một https URL. Test **phải** nạp cả hai
  schema vào `referencing.Registry` theo `$id`, với retrieve function **raise**. Mạng không phải fallback:
  một test âm thầm tải schema từ `main` sẽ xanh trong khi đang kiểm sai file.

### Manifest siết chặt hơn ở đâu

| Trường | `markerContent` (observer) | manifest (producer) |
|---|---|---|
| `evidence.sbom.*.predicateType` | non-empty string | `const` SPDX URI |
| `evidence.vulnerabilityScan.*.predicateType` | non-empty string | `const` Trivy vuln URI |
| `evidence.layerSecretScan.*.predicateType` | non-empty string | `const` Trivy layer-secret URI |
| `evidence.filesystemSecretScan.*.predicateType` | non-empty string | `const` Trivy fs-secret URI |
| `evidence.*.passed` | `boolean` (xem §4) | `const: true` |
| `flywayInventory.migrations[].success` | `boolean` (xem §4) | `const: true` |

Không siết `environment`, `migration.type`, `migration.script`: producer đọc chúng từ image, và đoán hình
dạng ở đây tạo ra chỗ mà một release đúng bị chặn.

Observer phải rộng vì registry có thể chứa rác; producer thì không được tự phát minh predicate.

## 4. Kết luận xác minh là `boolean`, không phải `const: true`

Nguyên tắc: **`false` là một phép xác minh đã hoàn tất và phát hiện mâu thuẫn → CONFLICT. Chỉ khi không
hoàn tất được phép xác minh mới là UNKNOWN.**

Hiện trạng: `publish-decision.sh:204, 222, 287, 345` đều đã trả CONFLICT cho `false`. Chính
`observation.schema.json` với `const: true` chặn `false` thành observation không hợp lệ → UNKNOWN trước
khi decision kịp thấy. Bất nhất nằm ở phía schema.

Đổi thành `"type": "boolean"` trong observation schema, giữ `const: true` trong manifest schema, cho năm
trường:

1. `verification.attestationVerified`
2. `verification.policyPassed`
3. `evidence.<kind>.<image>.passed`
4. `flywayInventory.migrations[].success`
5. `payloadDescriptor.digestVerified` (mới, §5)

Instance thứ tư không có trong review ban đầu nhưng cùng hình dạng chính xác: một hàng
`flyway_schema_history` với `success: false` đọc được từ image là kết luận âm đã hoàn tất, cần người.

Ma trận:

| Tình huống | Kết quả |
|---|---|
| `true` | tiếp tục |
| boolean `false` | **CONFLICT**, không action |
| thiếu field, hoặc sai kiểu (`"false"`, `0`, `null`) | **UNKNOWN** |
| timeout, lỗi mạng, 401/403/429/5xx, verifier crash, output hỏng | **UNKNOWN** (khai `status: "error"`) |
| tải đủ bytes, băm xong, lệch descriptor | **CONFLICT** |
| attestation đọc và kiểm đầy đủ, sai chữ ký / subject / signer / predicate / SHA | **CONFLICT** |

Ràng buộc bắt buộc lên collector (mục 5): **không được biến mọi exit code khác 0 của
`gh attestation verify` thành `false`.** Kết luận xác minh âm và không thực hiện được phép xác minh là
hai điều khác nhau, và gộp chúng lại là gửi người trực sự cố tới sai chỗ. `false` chỉ được khai khi
verifier chạy xong và trả lời "không".

`absent.observedCode: const 404` **không** thuộc lớp này và giữ nguyên: nó là một sự kiện quan sát, không
phải một kết luận.

Không fixture hiện có nào phải sửa cho §4 — cả 14 đều đang khai `true`. Chỉ thêm fixture cho nhánh `false`.

## 5. `artifactType` và `payloadDescriptor` trong observation

`presentMarker` thêm:

```
artifactType      : ["string", "null"]     — non-empty khi là string
payloadDescriptor : { mediaType, digest, size, digestVerified, layerCount }
```

Tên `payloadDescriptor` chứ không phải `payload`: nó mô tả descriptor của layer, không chứa payload.

`artifactType` khai `["string","null"]` **có chủ đích**: `null` là *một lời khai* — "object trong registry
không có `artifactType`", điều hoàn toàn hợp lệ trong OCI (nó là field optional, fallback về config
mediaType). Thiếu key là *không khai được*. Cùng hình dạng với `skipped.queriedRef: null`. Nếu khai
`"string"` thì `null` thành lỗi kiểu → UNKNOWN, và ta tái tạo đúng loại lệch đang sửa ở §6.

Observation **không** đặt `const` lên `artifactType`: nó phải mô tả được một object sai kiểu. `const` chỉ
sống trong manifest schema và như một hằng trong decision.

| Observation | Kết quả |
|---|---|
| thiếu key `artifactType` | **UNKNOWN** — collector không thực hiện đúng contract |
| `artifactType: null` | **CONFLICT** — registry trả object, nhưng không phải carrier yêu cầu |
| string khác hằng | **CONFLICT** |
| `application/vnd.tvu.release-manifest.v1+json` | tiếp tục |
| `artifactType` trên lookup không phải marker | **UNKNOWN** — tự rơi ra từ §6, không cần check riêng |

`payloadDescriptor.layerCount` là số nguyên; decision đòi `== 1`, khác đi là CONFLICT (một artifact nhiều
layer không phải thứ pipeline này phát hành). `payloadDescriptor.mediaType` phải bằng hằng layer mediaType.

## 6. Tách field set theo loại lookup (bug đang sống)

`publish-decision.sh:149-155` dùng **một** `allowed_fields` cho mọi lookup có `status: "present"`:
`{status, queriedRef, digest, markerDigest, verification, content}`. Chốt chặn duy nhất là `:182`,
`require("content" not in lookup)` cho Tag/Candidate/DigestObject. Hai đường lệch còn sống sau `6a2d312`:

- tag mang `verification` + `markerDigest` (không mang `content`) → schema `presentObject` từ chối,
  **decision nhận**
- marker mang `digest` → schema `presentMarker` từ chối, **decision nhận**

`contract-agreement.test.sh` không thấy vì không fixture nào chạm tới. Nó chứng minh agreement *trên các
fixture đang có*; nó không chứng minh được vắng mặt của lệch. Đây là lý do §3 dựng subset bằng cấu trúc
chứ không bằng fixture.

Sửa: field set tuyệt đối theo loại lookup.

| Loại | Field cho phép khi `present` |
|---|---|
| Tag / Candidate / DigestObject | `status`, `queriedRef`, `digest` |
| Marker | `status`, `queriedRef`, `markerDigest`, `artifactType`, `payloadDescriptor`, `verification`, `content` |

Hai fixture mới đi kèm commit này, mỗi cái là một trong hai đường lệch trên, cả hai `state: UNKNOWN`.

## 7. Năm hằng predicate

| Loại | URI |
|---|---|
| marker provenance (`verification.predicateType`) | `https://slsa.dev/provenance/v1` |
| SBOM | `https://spdx.dev/Document/v2.3` |
| vulnerability scan | `https://tvu.id.vn/attestations/vulnerabilityScan/v1` |
| layer secret scan | `https://tvu.id.vn/attestations/layerSecretScan/v1` |
| filesystem secret scan | `https://tvu.id.vn/attestations/filesystemSecretScan/v1` |

Trạng thái của URI SPDX: **VERIFIED-UPSTREAM, NOT-YET-EXERCISED-IN-THIS-REPOSITORY.** Tài liệu GitHub
dùng chính giá trị đó để verify SPDX SBOM và các attestation của `actions/attest-sbom` mang predicate đó,
nên nó không phải phỏng đoán — nhưng repo này chưa từng chạy trên runner Linux, nên nó cũng chưa phải
điều đã quan sát tại đây.

Ba URI Trivy không cần "quan sát trước": workflow chủ động truyền chính các URI đã pin vào
`actions/attest`. Việc runner phải chứng minh là nó thực sự phát hành đúng những URI đó.

Cách chống drift và chống sai:

1. Manifest schema là **một nguồn hằng duy nhất**.
2. `manifest-agreement.test.sh` đòi từng hằng trong `publish-decision.sh` khớp `const` trong schema.
3. Workflow **bắt buộc** sinh SPDX 2.3 — không để action tự suy diễn giữa SPDX và CycloneDX.
4. Lượt publish thật đầu tiên đọc ngược `predicateType` từ attestation và đối chiếu hằng.
5. Sai hằng thì **fail trước promote**. Tuyệt đối không "học" từ output rồi tự cập nhật hằng — một
   pipeline tự sửa kỳ vọng theo thứ nó quan sát được thì không còn kiểm gì nữa.
6. Sau lượt đó, lưu output đã rút gọn thành fixture và chuyển trạng thái sang verified-on-runner.

## 8. Bất biến

1. Tài liệu manifest đúng 7 key. Không `stage`, không timestamp, không tag name, không run number.
   `additionalProperties: false` cộng với `allOf`/`$ref` làm việc thêm key trở thành bất khả.
2. `:release-<sha>` và `:prepared-<sha>` là hai tag của **cùng một** OCI manifest digest. Tạo một lần,
   re-tag, không rebuild.
3. Observation schema rộng hơn manifest schema. Observer mô tả được cả artifact xấu; producer thì không
   được phát hành nó.
4. Collector xác minh; decision chỉ quyết định từ kết quả đã xác minh. Không tài liệu nào tự khẳng định
   mình đáng tin.
5. `false` (kết luận âm) → CONFLICT. Không hoàn tất được phép kiểm → UNKNOWN. Không bao giờ trộn.
6. Luật ngữ nghĩa liên-trường (`provenance.revision == commit`, `evidence.*.subjectDigest == images.*`,
   `flywayInventory.boundTo == images.monolith`, checksum recompute, unique version / repeatable script)
   ở nguyên trong `marker_problems`. JSON Schema không biểu diễn được chúng, và `invalid-semantics/` là
   bằng chứng viết ra rằng validate schema là chưa đủ.

## 9. Test và fixtures

`manifest-agreement.test.sh` — file riêng, giữ 17/17 của `contract-agreement.test.sh` nguyên vẹn.

Fixtures mới ở **`.github/contracts/release-manifest-fixtures/`**, không ở `fixtures/`:
`contract-agreement.test.sh:87-95` `rglob("*.json")` toàn bộ `fixtures/` **và** đòi mỗi file tìm được
phải có entry trong `expectations.json` — manifest fixture đặt ở đó làm đỏ hai test, không chỉ bị hiểu sai.

Ba điều được chứng minh, mỗi điều phải chứng minh đỏ được:

1. **Subset là thật** — mọi manifest fixture hợp lệ, nhúng vào observation template ở
   `lookups.finalMarker.content`, được observation schema chấp nhận. (`allOf` đã bảo đảm điều này về
   cấu trúc; test bắt trường hợp `$ref` resolve sai file hoặc registry nạp thiếu.)
2. **Subset là nghiêm ngặt** — ít nhất một document hợp lệ theo `markerContent` nhưng bị manifest schema
   từ chối (`predicateType` tự phát minh). Không có witness này thì bao hàm là trùng hợp.
3. **Không drift hằng** — `artifactType`, layer mediaType và năm predicate URI khớp nhau giữa manifest
   schema và `publish-decision.sh`.

Fixture cho fixture sai predicate phải đạt **cả ba** đồng thời: hợp lệ theo observation schema, không hợp
lệ theo manifest schema, decision trả `CONFLICT` không action.

Mạng bị cấm trong test: registry retrieve function raise.

## 10. Thứ tự commit

Mỗi commit chạy được và tự đứng vững. **Không commit trạng thái đỏ** — TDD cần *quan sát* RED trước khi
sửa, không cần lưu nó lại; bằng chứng RED ghi trong commit body.

1. `fix(ci): give each kind of lookup its own field set` — §6, kèm 2 fixture. Độc lập với phần còn lại,
   sửa một lệch đang sống.
2. `contract(ci): let the observation state a negative verdict` — §4, năm trường `const: true` → `boolean`,
   kèm fixture cho nhánh `false` (mỗi trường một cái, đều `CONFLICT`).
3. `contract(ci): freeze the release manifest as a schema` — `release-manifest.schema.json` (§3, §7) +
   `manifest-agreement.test.sh` + release-manifest fixtures.
4. `contract(ci): name the carrier the marker travels in` — §5, `artifactType` + `payloadDescriptor` vào
   `presentMarker`, hằng vào decision, 9 marker instance trong 8 fixture mỗi cái thêm envelope.

Sau mỗi commit: 113 + 26 mutation + 17 + suite mới, tất cả xanh, số ghi trong commit body.

## 11. Chạy trên Windows

`PUBLISH_DECISION_BASH` chỉ chọn bash cho **subprocess** (`contract-agreement.test.sh:39`). Lệnh top-level
vẫn phải gọi Git bash tường minh:

```powershell
$env:PUBLISH_DECISION_BASH = 'C:/Program Files/Git/bin/bash.exe'
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/manifest-agreement.test.sh
```

`bash` trên PATH là bash của WSL và không tới được interpreter đang chạy; `python3` trong Git Bash trỏ
vào stub WindowsApps và cần shim tới `Python312/python`.

## 12. Ghi chú về GitNexus

GitNexus không mô hình hóa shell script và JSON Schema, nên `impact` trên các file này trả Low/0 flow.
Kết quả đó **không** là bằng chứng an toàn cho hợp đồng này và sẽ không được trình bày như vậy.
`detect_changes()` vẫn chạy trước mỗi commit theo CLAUDE.md, nhưng luận cứ an toàn là suite 113, 26
mutation, hai agreement test, và các fixture ở trên.
