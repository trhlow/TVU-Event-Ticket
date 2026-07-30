# Release manifest contract 3a, commit 0-3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bốn commit đầu của 3a — làm cho các script contract chạy được trên Windows, đóng ba đường lệch giữa schema và decision, và biến "canonical" từ một tính từ thành một hàm có test.

**Architecture:** Không có tính năng mới. Bốn thay đổi độc lập lên hai artifact đã có (`.github/contracts/observation.schema.json` và `.github/scripts/publish-decision.sh`) cùng bộ test quanh chúng. Mỗi commit tự đứng vững, chạy được, và không tham chiếu tới field chưa tồn tại.

**Tech Stack:** Bash (Git Bash trên Windows, `bash` trên Ubuntu runner), Python 3.12+ (`json`, `hashlib`), `jsonschema` (Draft 2020-12), GitHub Actions.

**Spec:** `backend/docs/superpowers/specs/2026-07-30-release-manifest-contract-design.md` §10 commit 0-3.

## Global Constraints

- **Chạy từ gốc repo.** `Set-Location (git rev-parse --show-toplevel)`. `.github` không nhìn thấy được từ `backend/`.
- **Windows:** `$env:PUBLISH_DECISION_BASH = 'C:/Program Files/Git/bin/bash.exe'` và `$env:PYTHON_BIN = "$env:LOCALAPPDATA/Programs/Python/Python312/python.exe"`. `bash` trên PATH là bash của WSL và không tới được interpreter đang chạy.
- **JDK không liên quan** ở bốn commit này; không chạy `mvn`.
- **Không commit trạng thái đỏ.** Quan sát RED, sửa, rồi commit một lần. Bằng chứng RED (dòng FAIL nguyên văn) ghi trong commit body.
- **Không ghi số test cố định vào spec.** Mỗi commit body ghi số **thực tế đo được** của: `publish-decision.test.sh`, `require-green-run.test.sh`, `contract-agreement.test.sh`, mutation runner, và mọi suite mới.
- **Suite mới phải được nối vào `ci.yml` trong cùng commit tạo nó.** Dòng neo: `ci.yml:290-303`.
- **Canonical form cố ý KHÔNG phải JCS (RFC 8785).** `ensure_ascii=True`, `allow_nan=False`, `sort_keys=True`, `separators=(",", ":")`, không newline cuối, UTF-8 không BOM, cấm float, từ chối key trùng khi đọc.
- **`detect_changes()` chạy trước mỗi commit** theo CLAUDE.md, nhưng GitNexus không mô hình hoá shell/JSON Schema nên kết quả Low/0-flow **không** được trình bày như bằng chứng an toàn.
- **Ngoài phạm vi plan này:** commit 4 (tách repository), 5 (carrier/envelope), 6 (đóng băng payload), toàn bộ 3b, collector, job publish.

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `.github/scripts/python-bin.sh` | **Tạo.** Một chỗ duy nhất quyết định interpreter nào chạy, kèm probe fail-fast. Được `source`, không chạy trực tiếp. | 1 |
| `.github/scripts/interpreter-override.test.sh` | **Tạo.** Chứng minh `PYTHON_BIN` được tôn trọng, đường có khoảng trắng chạy được, interpreter hỏng thì đỏ với một câu đọc được, và không script nào còn gọi `python3` trực tiếp. | 1 |
| `.github/scripts/canonical.py` | **Tạo.** `canonical_bytes()`, `strict_loads()`, `canonical_digest()`. Nguồn duy nhất của canonical form. | 4 |
| `.github/scripts/canonical.test.sh` | **Tạo.** Golden bytes, golden digest kiểm bằng `sha256sum` độc lập, và một negative test cho **từng** tham số đã khoá. | 4 |
| `.github/contracts/canonical/golden.{json,bytes,digest}` | **Tạo.** Document mẫu có non-ASCII và số lớn, bytes mong đợi, digest mong đợi. | 4 |
| `.github/scripts/publish-decision.sh` | **Sửa.** Interpreter (task 1), field set theo loại lookup (task 2), dùng `canonical.py` (task 4). | 1, 2, 4 |
| `.github/scripts/publish-decision.test.sh` | **Sửa.** Interpreter ×5 (task 1), case cho field set (task 2), case cho verdict âm (task 3). | 1, 2, 3 |
| `.github/scripts/contract-agreement.test.sh` | **Sửa.** Interpreter (task 1). | 1 |
| `.github/scripts/publish-decision.mutations.py` | **Sửa.** Truyền interpreter xuống con + copy file mới vào workspace (task 1, 4), mutation mới (task 2, 3). | 1, 2, 3, 4 |
| `.github/contracts/observation.schema.json` | **Sửa.** Bốn `const: true` → `boolean`, sửa mô tả Flyway `:237` (task 3). | 3 |
| `.github/contracts/fixtures/**` + `expectations.json` | **Sửa.** 2 fixture (task 2), 4 fixture (task 3). | 2, 3 |
| `.github/workflows/ci.yml` | **Sửa.** Nối hai suite mới. | 1, 4 |

---

### Task 1: Một interpreter, tám call site, và một probe

**Files:**
- Create: `.github/scripts/python-bin.sh`
- Create: `.github/scripts/interpreter-override.test.sh`
- Modify: `.github/scripts/publish-decision.sh:23-34`
- Modify: `.github/scripts/contract-agreement.test.sh:26-29`
- Modify: `.github/scripts/publish-decision.test.sh:15, :29, :185, :190, :294, :336`
- Modify: `.github/scripts/publish-decision.mutations.py:18-32, :116-124`
- Modify: `.github/workflows/ci.yml` (cạnh dòng 291)

**Interfaces:**
- Produces: biến shell `PYTHON` (đã quote được, có thể chứa khoảng trắng) cho mọi script `source` `python-bin.sh`; biến môi trường `PYTHON_BIN` mà mutation runner truyền xuống tiến trình con.
- Consumes: không gì từ task khác.

- [ ] **Step 1: Viết test thất bại**

Tạo `.github/scripts/interpreter-override.test.sh`:

```bash
#!/usr/bin/env bash
# Tests that one variable decides which Python runs the contract scripts.
#
# On a Windows workstation `python3` on PATH is the WindowsApps stub: it exits without running
# anything, so a script that pipes a program into it gets an empty result rather than a failure.
# That is the worst possible shape of wrong -- every fixture failed for a reason none of them
# mentioned. PYTHON_BIN names a real interpreter; the probe turns a broken one into one readable
# line; and the last case here stops a future script from quietly reintroducing a raw `python3`.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
passed=0
failed=0

report() {
  if [[ -z "$2" ]]; then
    printf 'ok    %s\n' "$1"; passed=$((passed + 1))
  else
    printf 'FAIL  %s: %s\n' "$1" "$2"; failed=$((failed + 1))
  fi
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Resolve the interpreter this run is actually using, so the shim below wraps a working one.
real="${PYTHON_BIN:-python3}"
if [[ "$real" != /* && "$real" != ?:* ]]; then real="$(command -v "$real" || true)"; fi
if [[ -z "$real" ]]; then
  printf 'FAIL  no interpreter to test with; set PYTHON_BIN\n'; exit 1
fi

# A directory with a space in it. An unquoted interpreter path splits here and the script runs
# something that does not exist.
spaced="$work/with a space"
mkdir -p "$spaced"
printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$real" > "$spaced/python3"
chmod +x "$spaced/python3"

observation="$work/observation.json"
cp "$script_dir/../contracts/fixtures/valid/nothing-published.json" "$observation"

problems=""
out="$(PYTHON_BIN="$spaced/python3" bash "$script_dir/publish-decision.sh" "$observation" 2>&1)" \
  || problems="exited non-zero: ${out:0:200}"
if [[ -z "$problems" ]] && ! printf '%s' "$out" | grep -q '"state"'; then
  problems="no decision on stdout: ${out:0:200}"
fi
report "an interpreter path containing a space is honoured" "$problems"

problems=""
if out="$(PYTHON_BIN="$work/does-not-exist" bash "$script_dir/publish-decision.sh" "$observation" 2>&1)"; then
  problems="a broken interpreter was accepted; output: ${out:0:200}"
elif ! printf '%s' "$out" | grep -q 'PYTHON_BIN'; then
  problems="failed without naming PYTHON_BIN: ${out:0:200}"
fi
report "a broken interpreter fails loudly and names the variable" "$problems"

# The regression guard. python-bin.sh owns the default; nobody else may invoke the interpreter by
# name, or the override stops covering the whole surface again.
stray="$(grep -nE '(^|[;&|( ])python3[ "]' \
  "$script_dir/publish-decision.sh" \
  "$script_dir/publish-decision.test.sh" \
  "$script_dir/contract-agreement.test.sh" \
  | grep -vE ':[[:space:]]*#' || true)"
report "no contract script invokes python3 by name" "$stray"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

```powershell
Set-Location (git rev-parse --show-toplevel)
$env:PYTHON_BIN = "$env:LOCALAPPDATA/Programs/Python/Python312/python.exe"
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/interpreter-override.test.sh
```

Expected: cả **ba** case FAIL. Case 1 và 2 vì `publish-decision.sh` chưa đọc `PYTHON_BIN`; case 3 vì ba script còn gọi `python3` trực tiếp. Dán ba dòng `FAIL` vào commit body.

- [ ] **Step 3: Tạo `python-bin.sh`**

```bash
#!/usr/bin/env bash
# Which Python runs the contract scripts. Sourced, never executed: it sets PYTHON for the caller.
#
# On an Ubuntu runner `python3` on PATH is the only one there is. On a Windows workstation it is the
# WindowsApps stub, which exits without running the program it was handed, so every script that
# pipes one into it read back nothing and reported that as a result. The probe below is why a
# broken interpreter now costs one readable line instead of forty fixtures failing for a reason
# none of them names.
#
# PYTHON is quoted at every use site: an interpreter path may contain a space, and an unquoted one
# splits into a command nobody installed.
PYTHON="${PYTHON_BIN:-python3}"

if ! "$PYTHON" -c 'import sys; sys.exit(0)' >/dev/null 2>&1; then
  printf 'FAIL  interpreter %s cannot run a program; set PYTHON_BIN to a working python3\n' \
    "$PYTHON" >&2
  exit 1
fi
```

- [ ] **Step 4: Nối vào `publish-decision.sh`**

Sau `set -euo pipefail` (dòng 23), thêm:

```bash
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"
```

Rồi đổi dòng 34:

```bash
"$PYTHON" - "$observation" <<'PYTHON'
```

- [ ] **Step 5: Nối vào `contract-agreement.test.sh`**

Sau dòng 27 (`repo_root=...`), thêm:

```bash
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"
```

Đổi dòng 29:

```bash
"$PYTHON" - "$repo_root" "$script_dir/publish-decision.sh" <<'PYTHON'
```

Không cần đổi gì trong chương trình Python bên trong: nó spawn `BASH publish-decision.sh`, và `PYTHON_BIN` đã có trong môi trường nên script con tự đọc được.

- [ ] **Step 6: Nối vào `publish-decision.test.sh` — cả năm chỗ**

Sau dòng 16 (`subject=...`), thêm:

```bash
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"
```

Đổi dòng 29:

```bash
python_json() { "$PYTHON" -c "$1" "${@:2}"; }
```

Đổi bốn chỗ còn lại — dòng 185, 190, 294, 336 — từ `| python3 -c '` thành `| "$PYTHON" -c '` (dòng 294 dùng dấu nháy kép: `| "$PYTHON" -c "`).

- [ ] **Step 7: Truyền interpreter xuống mutation runner**

Trong `publish-decision.mutations.py`, sau dòng 30 (`BASH = ...`), thêm:

```python
# If this runner started at all, its own interpreter works, so hand that one down rather than
# letting the children fall back to a `python3` that may be a stub. An explicit PYTHON_BIN still
# wins: the caller may be testing a different interpreter on purpose.
CHILD_ENV = {**os.environ, "PYTHON_BIN": os.environ.get("PYTHON_BIN") or sys.executable}
```

Đổi `run_suite` (dòng 119):

```python
        result = subprocess.run([BASH, SUITE], cwd=directory, capture_output=True, text=True,
                                timeout=SUITE_TIMEOUT_SECONDS, env=CHILD_ENV)
```

- [ ] **Step 8: Copy `python-bin.sh` vào workspace của mutation runner**

Runner copy script sang thư mục tạm rồi mutate ở đó, nên file được `source` **phải** có mặt hoặc baseline đỏ — và runner từ chối baseline đỏ, nên bạn sẽ thấy "baseline red" mà không có lời giải thích nào.

```powershell
Select-String -Path .github/scripts/publish-decision.mutations.py -Pattern "copy" -Context 2,2
```

Thêm `"python-bin.sh"` vào danh sách file được copy vào workspace, cạnh `SUBJECT` và `SUITE`.

- [ ] **Step 9: Chạy test để xác nhận nó xanh**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/interpreter-override.test.sh
```

Expected: `passed=3 failed=0`.

- [ ] **Step 10: Chạy toàn bộ suite hiện có, ghi số thực tế**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/publish-decision.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/require-green-run.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
& "$env:PYTHON_BIN" .github/scripts/publish-decision.mutations.py
```

Expected: tất cả xanh, mutation runner báo mọi mutation bị bắt. Ghi bốn con số vào commit body.

- [ ] **Step 11: Nối suite mới vào `ci.yml`**

Cạnh dòng 291 (`bash .github/scripts/publish-decision.test.sh`), thêm:

```yaml
          bash .github/scripts/interpreter-override.test.sh
```

- [ ] **Step 12: Commit**

```bash
git add .github/scripts/python-bin.sh .github/scripts/interpreter-override.test.sh \
  .github/scripts/publish-decision.sh .github/scripts/publish-decision.test.sh \
  .github/scripts/contract-agreement.test.sh .github/scripts/publish-decision.mutations.py \
  .github/workflows/ci.yml
git commit -m "fix(ci): let the contract scripts name their interpreter"
```

Commit body phải có: ba dòng FAIL từ Step 2, bốn con số từ Step 10, và câu giải thích rằng `PYTHON_BIN` phủ tám call site trên bốn file, không phải hai.

---

### Task 2: Mỗi loại lookup có field set của riêng nó

**Files:**
- Modify: `.github/scripts/publish-decision.sh:55-72, :147-155, :180-182`
- Modify: `.github/scripts/publish-decision.test.sh` (thêm một khối case)
- Modify: `.github/scripts/publish-decision.mutations.py` (thêm một mutation)
- Create: `.github/contracts/fixtures/invalid-structure/tag-carrying-marker-fields.json`
- Create: `.github/contracts/fixtures/invalid-structure/marker-carrying-a-digest.json`
- Modify: `.github/contracts/fixtures/expectations.json`

**Interfaces:**
- Consumes: `PYTHON` từ Task 1.
- Produces: hằng `MARKER_LOOKUPS` và dict `PRESENT_FIELDS` trong `publish-decision.sh`; hai tên fixture ở trên.

- [ ] **Step 1: Viết hai fixture thất bại**

`.github/contracts/fixtures/invalid-structure/tag-carrying-marker-fields.json` — copy `valid/nothing-published.json`, rồi đổi `lookups.monolithTag` thành:

```json
{
  "status": "present",
  "queriedRef": "ghcr.io/owner/name:sha-0123456789abcdef0123456789abcdef01234567",
  "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "markerDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  "verification": {
    "attestationVerified": true,
    "subjectDigest": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    "signerRepository": "owner/name",
    "signerWorkflow": ".github/workflows/ci.yml",
    "sourceRevision": "0123456789abcdef0123456789abcdef01234567",
    "predicateType": "https://slsa.dev/provenance/v1",
    "policyPassed": true
  }
}
```

`.github/contracts/fixtures/invalid-structure/marker-carrying-a-digest.json` — copy `valid/prepared-only.json`, rồi thêm vào `lookups.preparedMarker` một khoá:

```json
  "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
```

Thêm vào `expectations.json`:

```json
  "invalid-structure/marker-carrying-a-digest.json": {
    "actions": [],
    "schema": "rejects",
    "state": "UNKNOWN"
  },
  "invalid-structure/tag-carrying-marker-fields.json": {
    "actions": [],
    "schema": "rejects",
    "state": "UNKNOWN"
  },
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
```

Expected: hai FAIL, mỗi cái dạng `state='ABSENT' wanted 'UNKNOWN'` (fixture tag) và `state='PARTIAL' wanted 'UNKNOWN'` (fixture marker) — decision **nhận** các field mà schema từ chối. Đó chính là hai đường lệch. Dán vào commit body.

- [ ] **Step 3: Tách field set trong `publish-decision.sh`**

Thay khối `LOOKUP_FIELDS` (dòng 55-72) bằng:

```python
MARKER_LOOKUPS = ("finalMarker", "preparedMarker")
VALID_STATUSES = ("present", "absent", "error", "skipped")

# Exactly the fields each observed state may carry. One shared set for every "present" lookup left
# two divergences alive after the reconciliation: a tag carrying `verification` and `markerDigest`,
# and a marker carrying `digest`, are both rejected by the schema and were both accepted here. The
# single guard further down (`"content" not in lookup`) closed one of three doors, and no fixture
# touched the other two -- which is why the agreement suite reported agreement anyway.
LOOKUP_FIELDS = {
    # Every lookup records what it asked about. Without queriedRef an "absent" is an assertion with
    # no subject, and two lookups that queried different references look identical.
    "absent": ({"status", "observedCode", "queriedRef"}, {"status", "observedCode", "queriedRef"}),
    "error": ({"status", "queriedRef"}, {"status", "queriedRef", "code", "timeout", "detail"}),
    # A digest object cannot be queried before a marker names a digest. "skipped" says the question
    # was never asked, which is different from asking and being told no. queriedRef is carried even
    # here, and must be null: the key's presence records that the collector considered the lookup.
    "skipped": ({"status", "reason", "queriedRef"}, {"status", "reason", "queriedRef"}),
}

# Present is the one status whose fields depend on what was looked up, so it gets its own table.
# Required equals allowed on purpose: there is no optional field on a present lookup, and an
# optional one would be a fact nobody stated dressed up as a fact omitted.
PRESENT_FIELDS = {
    "marker": ({"status", "queriedRef", "markerDigest", "verification", "content"},
               {"status", "queriedRef", "markerDigest", "verification", "content"}),
    "object": ({"status", "queriedRef", "digest"},
               {"status", "queriedRef", "digest"}),
}
```

- [ ] **Step 4: Dùng bảng mới trong `validate`**

Thay dòng 147-155 bằng:

```python
        require(status in VALID_STATUSES,
                f"lookups.{name}.status must be one of {list(VALID_STATUSES)}, got {status!r}")
        if status == "present":
            kind = "marker" if name in MARKER_LOOKUPS else "object"
            required_fields, allowed_fields = PRESENT_FIELDS[kind]
        else:
            kind = status
            required_fields, allowed_fields = LOOKUP_FIELDS[status]
        present_fields = set(lookup)
        require(required_fields <= present_fields,
                f"lookups.{name} is missing {', '.join(sorted(required_fields - present_fields))}")
        require(present_fields <= allowed_fields,
                f"lookups.{name} is a {kind} lookup and carries fields that do not belong to it: "
                f"{', '.join(sorted(present_fields - allowed_fields))}")
```

- [ ] **Step 5: Bỏ guard đã thành thừa**

Ở dòng 180-182, xoá `require("content" not in lookup, ...)`. Nó là một phần ba của luật mà `PRESENT_FIELDS["object"]` giờ phát biểu trọn vẹn, và để lại hai chỗ nói cùng một điều là để lại một chỗ sẽ lệch. Giữ nguyên `exact_str(lookup.get("digest"), ...)`: nó kiểm **dạng** của digest, không kiểm field set.

```python
        elif name.endswith(("Tag", "Candidate", "DigestObject")):
            exact_str(lookup.get("digest"), f"lookups.{name}.digest", DIGEST)
```

- [ ] **Step 6: Thêm case vào `publish-decision.test.sh`**

Thêm vào cuối, trước phần tổng kết. Cả hai case phải phân lập **đúng** luật field set, nên tag vẫn mang
`digest` hợp lệ của nó và marker vẫn đủ field bắt buộc — nếu thiếu, case sẽ ra UNKNOWN vì `required`
và không chứng minh được gì về `allowed`:

```bash
echo
echo "== a lookup may carry only the fields its own kind has"
# Both of these were rejected by the schema and accepted here. The tag keeps a valid digest and the
# marker keeps every field it needs, so the only thing wrong with each is a field belonging to the
# other kind -- otherwise the case would reach UNKNOWN through the missing-field check instead and
# prove nothing.
tag_with_marker_fields="$(base_obs | python_json '
import json, sys
o = json.loads(sys.stdin.read())
o["lookups"]["monolithTag"] = {"status": "present",
                               "queriedRef": "ghcr.io/owner/name:sha-" + sys.argv[1],
                               "digest": sys.argv[2],
                               "markerDigest": sys.argv[3],
                               "verification": {"attestationVerified": True}}
print(json.dumps(o))' "$SHA" "$MONO" "$MARKER_DIGEST")"
assert_decision "a tag carrying marker fields" "$tag_with_marker_fields" UNKNOWN '[]' false false

marker_with_digest="$(observation "$absent" "$(marker)" "$absent" "$absent" | python_json '
import json, sys
o = json.loads(sys.stdin.read())
o["lookups"]["preparedMarker"]["digest"] = sys.argv[1]
print(json.dumps(o))' "$MONO")"
assert_decision "a marker carrying a digest" "$marker_with_digest" UNKNOWN '[]' false false
```

`python_json` hiện truyền chương trình qua `-c` và đọc argv, nên hai case trên đọc observation từ
**stdin**; nếu `python_json` trong repo không nối stdin, đổi hai chỗ `sys.stdin.read()` thành
`sys.argv[N]` và truyền observation làm tham số đầu.

- [ ] **Step 7: Thêm mutation**

Trong `MUTATIONS` của `publish-decision.mutations.py`:

```python
    "present_fields_not_split": (
        'kind = "marker" if name in MARKER_LOOKUPS else "object"',
        'kind = "marker"'),
```

Mutation này cho mọi lookup dùng field set của marker, nên fixture tag sẽ đi qua — suite **phải** đỏ.

- [ ] **Step 8: Chạy tất cả, xác nhận xanh**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/publish-decision.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/interpreter-override.test.sh
& "$env:PYTHON_BIN" .github/scripts/publish-decision.mutations.py
```

Expected: tất cả xanh; mutation mới bị bắt. Ghi số thực tế.

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/publish-decision.sh .github/scripts/publish-decision.test.sh \
  .github/scripts/publish-decision.mutations.py .github/contracts/fixtures/
git commit -m "fix(ci): give each kind of lookup its own field set"
```

Commit body: hai dòng FAIL từ Step 2, và câu nói rõ vì sao `contract-agreement.test.sh` không thấy hai đường này — nó chứng minh agreement *trên các fixture đang có*, không chứng minh vắng mặt của lệch.

---

### Task 3: Observation phải khai được một kết luận âm

**Files:**
- Modify: `.github/contracts/observation.schema.json:137-148, :218-231, :234-247, :256-278`
- Create: `.github/contracts/fixtures/invalid-semantics/attestation-not-verified.json`
- Create: `.github/contracts/fixtures/invalid-semantics/policy-did-not-pass.json`
- Create: `.github/contracts/fixtures/invalid-semantics/evidence-did-not-pass.json`
- Create: `.github/contracts/fixtures/invalid-semantics/a-migration-failed.json`
- Modify: `.github/contracts/fixtures/expectations.json`
- Modify: `.github/scripts/publish-decision.mutations.py` (một mutation)

**Interfaces:**
- Consumes: `PYTHON` (Task 1). Không phụ thuộc Task 2.
- Produces: bốn tên fixture ở trên.

- [ ] **Step 1: Viết bốn fixture thất bại**

Mỗi cái copy từ `valid/prepared-only.json` và đổi **đúng một** giá trị trong `lookups.preparedMarker`:

| Fixture | Đổi |
|---|---|
| `attestation-not-verified.json` | `verification.attestationVerified` → `false` |
| `policy-did-not-pass.json` | `verification.policyPassed` → `false` |
| `evidence-did-not-pass.json` | `content.evidence.layerSecretScan.monolith.passed` → `false` |
| `a-migration-failed.json` | `content.flywayInventory.migrations[0].success` → `false` |

Cả bốn vào `expectations.json` với **`"schema": "accepts"`** và `"state": "CONFLICT"`, `"actions": []`.

- [ ] **Step 2: Chạy để xác nhận đỏ**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
```

Expected: bốn FAIL, tất cả dạng `the schema rejected it but this fixture is filed as structurally valid`. **State đã đúng CONFLICT** — decision (`:204, :222, :287, :345`) vốn đã trả CONFLICT qua `marker_problems`. Đỏ nằm hoàn toàn ở phía schema. Dán bốn dòng vào commit body: nó chính là bằng chứng rằng đây là bất nhất một phía.

- [ ] **Step 3: Đổi bốn `const: true` thành `boolean`**

`attestationVerified`:

```json
        "attestationVerified": {
          "type": "boolean",
          "description": "The outcome of the check, not a claim that one happened. A completed verification that came back negative is a readable fact about the registry and reaches CONFLICT; const true made it a malformed observation instead, which reaches UNKNOWN and sends an operator to collect a broken marker again."
        },
```

`policyPassed`:

```json
        "policyPassed": {
          "type": "boolean",
          "description": "Same reason as attestationVerified: false is a verdict, not a defect in the observation."
        }
```

`evidenceEntry.passed`:

```json
        "passed": {
          "type": "boolean",
          "description": "Read out of the marker, so false is what the registry holds and needs a person. Only the producer schema may pin this to true."
        }
```

`migration.success`:

```json
        "success": {
          "type": "boolean",
          "description": "A failed migration must not be released -- but it must be describable, or the observation cannot state what it found. false is CONFLICT, not an unusable observation."
        }
```

- [ ] **Step 4: Sửa mô tả Flyway sai ở `:237`**

```json
      "description": "Read from flyway_schema_history in a throwaway Postgres after the candidate monolith image has run its migrations -- not from the image, which contains the scripts and no history table, and not from the source tree. The point is what the image will actually apply.",
```

- [ ] **Step 5: Thêm mutation**

```python
    "negative_verdict_accepted": (
        'if verification.get("attestationVerified") is not True:',
        "if False:"),
```

- [ ] **Step 6: Chạy tất cả, xác nhận xanh**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/publish-decision.test.sh
& "$env:PYTHON_BIN" .github/scripts/publish-decision.mutations.py
```

Expected: tất cả xanh. **Không fixture cũ nào bị phân loại lại** — hai fixture `invalid-structure/{evidence-missing-layer-secret-scan,migration-without-installed-rank}.json` vi phạm `required`, không vi phạm `const`, nên chúng vẫn `schema: rejects` + `CONFLICT`. Nếu một trong hai đổi trạng thái, bạn đã sửa quá phạm vi.

- [ ] **Step 7: Commit**

```bash
git add .github/contracts/observation.schema.json .github/contracts/fixtures/ \
  .github/scripts/publish-decision.mutations.py
git commit -m "contract(ci): let the observation state a negative verdict"
```

Commit body: bốn dòng FAIL từ Step 2, và câu nói rõ bất nhất nằm hoàn toàn ở phía schema — decision đã trả CONFLICT từ trước, `const: true` chặn `false` thành observation không hợp lệ nên nó rơi vào UNKNOWN trước khi decision kịp thấy.

---

### Task 4: `canonical` là một hàm, không phải một tính từ

**Files:**
- Create: `.github/scripts/canonical.py`
- Create: `.github/scripts/canonical.test.sh`
- Create: `.github/contracts/canonical/golden.json`
- Create: `.github/contracts/canonical/golden.bytes`
- Create: `.github/contracts/canonical/golden.digest`
- Modify: `.github/scripts/publish-decision.sh:34, :79-87, :364-376`
- Modify: `.github/scripts/publish-decision.mutations.py` (copy thêm file)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `PYTHON` (Task 1).
- Produces: `canonical.canonical_bytes(value) -> bytes` và `canonical.strict_loads(text) -> object`. Commit 5 sẽ dùng `hashlib.sha256(canonical_bytes(raw)).hexdigest()`.

- [ ] **Step 1: Viết golden fixture và test thất bại**

`.github/contracts/canonical/golden.json` — non-ASCII và một số vượt 2^53 để pin `ensure_ascii` và cách viết integer:

```json
{
  "environment": "sản xuất",
  "b": [3, 1, 2],
  "a": {"z": null, "y": true},
  "big": 9007199254740993
}
```

`.github/contracts/canonical/golden.bytes` — **không newline cuối**:

```
{"a":{"y":true,"z":null},"b":[3,1,2],"big":9007199254740993,"environment":"s\u1ea3n xu\u1ea5t"}
```

`.github/contracts/canonical/golden.digest` — sinh ở Step 5, không đánh máy tay.

`.github/scripts/canonical.test.sh`:

```bash
#!/usr/bin/env bash
# Tests the one canonical form and the one strict reader.
#
# Two independent legs on purpose. The bytes are compared against a file a human can read, and the
# digest is compared against sha256sum rather than against canonical_digest -- a digest checked with
# the same function that produced it proves only that the function is deterministic.
set -uo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=python-bin.sh
source "$script_dir/python-bin.sh"
contracts="$script_dir/../contracts/canonical"

passed=0
failed=0
report() {
  if [[ -z "$2" ]]; then printf 'ok    %s\n' "$1"; passed=$((passed + 1))
  else printf 'FAIL  %s: %s\n' "$1" "$2"; failed=$((failed + 1)); fi
}

# Leg one: the exact bytes.
problems="$("$PYTHON" - "$script_dir" "$contracts" <<'PYTHON'
import pathlib, sys
sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads

contracts = pathlib.Path(sys.argv[2])
document = strict_loads(contracts.joinpath("golden.json").read_text(encoding="utf-8"))
want = contracts.joinpath("golden.bytes").read_bytes()
got = canonical_bytes(document)
if got != want:
    print(f"canonical bytes are {got!r}, golden.bytes says {want!r}")
elif want.endswith(b"\n"):
    print("golden.bytes ends with a newline; the canonical form has none")
PYTHON
)"
report "the canonical bytes are exactly the golden bytes" "$problems"

# Leg two: an independent hasher.
want_digest="$(tr -d ' \n' < "$contracts/golden.digest")"
got_digest="sha256:$(sha256sum "$contracts/golden.bytes" | cut -d' ' -f1)"
problems=""
[[ "$want_digest" == "$got_digest" ]] || problems="golden.digest is $want_digest, sha256sum says $got_digest"
report "golden.digest matches sha256sum of golden.bytes" "$problems"

# Every pinned parameter gets a case that fails when it is unpinned.
problems="$("$PYTHON" - "$script_dir" <<'PYTHON'
import sys
sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads

def refuses(label, thunk):
    try:
        thunk()
    except ValueError:
        return None
    return f"{label} was accepted"

problems = [p for p in [
    refuses("a duplicate key", lambda: strict_loads('{"a":1,"a":2}')),
    refuses("NaN", lambda: strict_loads('{"a":NaN}')),
    refuses("Infinity", lambda: strict_loads('{"a":Infinity}')),
    refuses("a float", lambda: strict_loads('{"a":1.5}')),
    refuses("a BOM", lambda: strict_loads('\ufeff{"a":1}')),
    refuses("a float built in Python", lambda: canonical_bytes({"a": 1.5})),
] if p]

# ensure_ascii is pinned to True, which is what the existing Flyway checksums were computed with.
if b"\\u00e9" not in canonical_bytes({"a": "\u00e9"}):
    problems.append("non-ASCII was not escaped; ensure_ascii is not pinned to True")
if canonical_bytes({"a": 1}).endswith(b"\n"):
    problems.append("canonical bytes end with a newline")
if canonical_bytes({"b": 1, "a": 2}) != b'{"a":2,"b":1}':
    problems.append("keys are not sorted, or separators carry whitespace")
print("; ".join(problems))
PYTHON
)"
report "every pinned parameter is pinned" "$problems"

printf '\npassed=%d failed=%d\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/canonical.test.sh
```

Expected: FAIL với `ModuleNotFoundError: No module named 'canonical'`. Dán vào commit body.

- [ ] **Step 3: Viết `canonical.py`**

```python
"""The one canonical form, and the one strict reader.

Deliberately NOT RFC 8785 (JCS). The Flyway inventory checksums in the fixtures were computed with
Python's sorted, compact dump, and JCS escapes strings and formats numbers differently, so adopting
it would invalidate every checksum that already exists. What matters here is that exactly one form
exists and that every parameter of it is pinned -- not that it matches a standard nothing else in
this pipeline reads.

Writing `json.dumps(value, sort_keys=True, separators=(",", ":"))` is not enough on its own:
ensure_ascii defaults to True (so it must be stated, not inherited), allow_nan defaults to True (so
NaN and Infinity would be emitted as tokens no other parser accepts), and json.loads silently keeps
the last of duplicate keys (which is how a later "absent" hides an earlier "error").
"""
import json

__all__ = ["canonical_bytes", "strict_loads"]


def _no_duplicates(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate key {key!r}")
        seen[key] = value
    return seen


def _forbid_float(text):
    raise ValueError(f"{text} is a float; the canonical form admits integers only, because no two "
                     f"runtimes agree on how to write a float")


def _forbid_constant(name):
    raise ValueError(f"{name} is not JSON")


def _reject_floats(value, where="<root>"):
    # A caller may build a dict in Python rather than read one, so the reader's guard is not enough.
    if isinstance(value, float):
        raise ValueError(f"{where} is a float; the canonical form admits integers only")
    if isinstance(value, dict):
        for key, item in value.items():
            _reject_floats(item, f"{where}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_floats(item, f"{where}[{index}]")


def strict_loads(text):
    """Parse, refusing everything the canonical form cannot round-trip."""
    if text.startswith("\ufeff"):
        raise ValueError("input starts with a BOM; the canonical form has none")
    return json.loads(text, object_pairs_hook=_no_duplicates,
                      parse_float=_forbid_float, parse_constant=_forbid_constant)


def canonical_bytes(value):
    """The bytes. UTF-8, no BOM, no trailing newline, sorted keys, no whitespace, ASCII-escaped."""
    _reject_floats(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("utf-8")
```

Không có `canonical_digest()`: commit 5 cần `sha256(canonical_bytes(raw))` và gọi `hashlib` trực tiếp là
đủ. Một hàm chưa ai gọi là một hàm chưa ai test.

- [ ] **Step 4: Chạy lại, xác nhận hai leg đầu và leg ba xanh, digest còn đỏ**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/canonical.test.sh
```

Expected: case bytes và case tham số PASS; case digest FAIL vì `golden.digest` chưa tồn tại.

- [ ] **Step 5: Sinh `golden.digest`**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' -c "printf 'sha256:%s' `$(sha256sum .github/contracts/canonical/golden.bytes | cut -d' ' -f1) > .github/contracts/canonical/golden.digest"
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/canonical.test.sh
```

Expected: `passed=3 failed=0`.

- [ ] **Step 6: Cho `publish-decision.sh` dùng module thay vì bản sao của chính nó**

Đổi dòng 34 để truyền thư mục script vào chương trình:

```bash
"$PYTHON" - "$script_dir" "$observation" <<'PYTHON'
```

Đầu chương trình Python, sau các `import`:

```python
sys.path.insert(0, sys.argv[1])
from canonical import canonical_bytes, strict_loads
```

Xoá hàm `no_duplicates` (dòng 79-87) và dùng `strict_loads` ở chỗ đang `json.loads(..., object_pairs_hook=no_duplicates)`.

Thay `canonical()` (dòng 375-376) bằng `canonical_bytes`, và đổi hai chỗ so sánh content của marker sang `canonical_bytes(...)`.

Thay phép tính checksum Flyway (dòng 366-368):

```python
    ordered = sorted(migrations, key=lambda record: record["installedRank"])
    computed = hashlib.sha256(canonical_bytes(ordered)).hexdigest()
```

**Đây là refactor không đổi hành vi.** `canonical_bytes` cho ra đúng bytes mà `json.dumps(sort_keys=True, separators=(",", ":"))` vẫn cho, nên mọi checksum trong 14 fixture phải giữ nguyên giá trị. Bằng chứng là 14 fixture đó tiếp tục xanh — nếu một cái đỏ, bytes đã đổi và bạn phải tìm ra vì sao chứ **không** được tính lại checksum trong fixture.

Cập nhật `sys.argv` index: chỗ nào đang đọc `sys.argv[1]` cho observation phải đổi sang `sys.argv[2]`.

- [ ] **Step 7: Copy hai file mới vào workspace mutation runner**

Thêm `"canonical.py"` vào danh sách copy (cùng chỗ đã thêm `python-bin.sh` ở Task 1 Step 8). Không có nó, baseline đỏ và runner từ chối chạy.

- [ ] **Step 8: Chạy tất cả**

```powershell
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/canonical.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/publish-decision.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/contract-agreement.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/interpreter-override.test.sh
& 'C:/Program Files/Git/bin/bash.exe' .github/scripts/require-green-run.test.sh
& "$env:PYTHON_BIN" .github/scripts/publish-decision.mutations.py
```

Expected: tất cả xanh, mọi mutation bị bắt, và **không checksum fixture nào phải sửa**.

- [ ] **Step 9: Nối vào `ci.yml`**

Cạnh dòng đã thêm ở Task 1 Step 11:

```yaml
          bash .github/scripts/canonical.test.sh
```

- [ ] **Step 10: Commit**

```bash
git add .github/scripts/canonical.py .github/scripts/canonical.test.sh \
  .github/contracts/canonical/ .github/scripts/publish-decision.sh \
  .github/scripts/publish-decision.mutations.py .github/workflows/ci.yml
git commit -m "contract(ci): make canonical a function instead of an adjective"
```

Commit body: dòng FAIL từ Step 2, số thực tế từ Step 8, và câu nói rõ đây là refactor không đổi hành vi mà bằng chứng là 14 checksum fixture giữ nguyên — cộng lý do không dùng JCS.

---

## Sau bốn commit này

Commit 4 (tách `expected.repository`) và commit 5 (carrier/envelope) **chưa** được lập kế hoạch, theo đúng ranh giới review. Commit 5 phụ thuộc `canonical_bytes()` của Task 4 vì `raw` được kiểm bằng `sha256(canonical_bytes(raw)) == markerDigest`. Commit 6 chờ 3b.
