#!/usr/bin/env bash
# Guards the off-site half of backup-postgres.sh, which is the half that can fail in ways nobody
# notices until they need it.
#
# Running the script itself needs a live compose stack and a Postgres container, so it cannot be
# exercised here; what CAN be checked without one is the ordering and the absence of a plaintext
# upload, which is exactly where the two failures below live. The age round-trip at the end is real
# whenever age is installed -- and says so loudly when it is not, because a suite that quietly
# skips its only executable check is how "verified" stops meaning anything.
set -uo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
script="$here/backup-postgres.sh"
passed=0
failed=0

report() {
  if [[ "$2" == "ok" ]]; then
    passed=$((passed + 1))
    echo "ok    $1"
  else
    failed=$((failed + 1))
    echo "FAIL  $1: $3"
  fi
}

# Line numbers of real code only. Every comment in this script discusses rclone, age and the ERR
# trap by name, and matching prose instead of the statement is how an ordering check passes against
# a file that has the ordering wrong -- already paid for once in env-guards.test.sh.
code_line() {
  grep -n '^[[:space:]]*[^#[:space:]]' "$script" | grep -- "$1" | head -1 | cut -d: -f1
}

[[ -f "$script" ]] || { echo "FAIL  cannot find $script"; exit 1; }

# 1. The dump must never leave the host in the clear. This is the irreversible one: an unencrypted
#    object handed to third-party storage is not un-handed by deleting it afterwards.
if grep -n '^[[:space:]]*[^#[:space:]]' "$script" | grep -q 'rclone copy "\$backup_file"'; then
  report "the plaintext dump is never uploaded" fail \
    "backup-postgres.sh has a 'rclone copy \"\$backup_file\"' -- that ships every student's name, \
email and MSSV to the remote in the clear"
else
  report "the plaintext dump is never uploaded" ok
fi

# 2. The recipient guard has to run BEFORE the first upload, or it guards nothing.
guard_line="$(code_line 'BACKUP_AGE_RECIPIENT:-')"
first_copy_line="$(code_line 'rclone copy')"
if [[ -z "$guard_line" || -z "$first_copy_line" ]]; then
  report "the encryption-recipient guard precedes the first upload" fail \
    "could not find both lines (guard=${guard_line:-none} copy=${first_copy_line:-none})"
elif (( guard_line < first_copy_line )); then
  report "the encryption-recipient guard precedes the first upload" ok
else
  report "the encryption-recipient guard precedes the first upload" fail \
    "the guard is on line $guard_line but the first rclone copy is on line $first_copy_line, so a \
run with BACKUP_REMOTE set and no recipient uploads before it is stopped"
fi

# 3. The ERR trap that deletes the dump must be disarmed before the off-site block. While it stayed
#    armed, an rclone that could not reach the remote deleted the backup that had just been verified
#    -- one fewer backup, in the exact situation the off-site copy exists to survive.
disarm_line="$(code_line 'trap - ERR')"
if [[ -z "$disarm_line" ]]; then
  report "the delete-the-dump ERR trap is disarmed before the upload" fail \
    "no 'trap - ERR' in the script, so any failure after the dump is verified deletes it"
elif [[ -n "$first_copy_line" ]] && (( disarm_line < first_copy_line )); then
  report "the delete-the-dump ERR trap is disarmed before the upload" ok
else
  report "the delete-the-dump ERR trap is disarmed before the upload" fail \
    "trap - ERR is on line $disarm_line, the first rclone copy on line ${first_copy_line:-none}"
fi

# 4. age exiting 0 is not evidence of an encrypted file, the same way pg_restore --list was not
#    evidence of a whole dump. The banner check is what makes it evidence.
if grep -q 'age-encryption.org/v1' "$script"; then
  report "the encrypted artifact is checked for the age format banner" ok
else
  report "the encrypted artifact is checked for the age format banner" fail \
    "nothing verifies that the uploaded file is actually an age file"
fi

# 5. The real thing, when the tool is here: encrypt to a public key, confirm the banner this script
#    greps for is genuinely what age writes, and confirm the private key gets the bytes back.
#    Asserting on a format the test never observed would be a guess dressed as a check.
if command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  trap 'rm -rf -- "$tmp"' EXIT
  age-keygen -o "$tmp/key.txt" 2>/dev/null
  recipient="$(grep -o 'age1[0-9a-z]*' "$tmp/key.txt" | head -1)"
  printf 'student,mssv\nNguyen Van A,110119999\n' > "$tmp/plain.dump"

  if age -r "$recipient" -o "$tmp/plain.dump.age" "$tmp/plain.dump" 2>/dev/null; then
    read -r banner < "$tmp/plain.dump.age" || banner=""
    [[ "$banner" == "age-encryption.org/v1" ]] \
      && report "age writes the banner the script greps for" ok \
      || report "age writes the banner the script greps for" fail \
           "first line was '$banner', so the script's check would reject a good file"

    grep -q '110119999' "$tmp/plain.dump.age" \
      && report "the encrypted file does not contain the plaintext" fail \
           "the MSSV is readable in the encrypted output" \
      || report "the encrypted file does not contain the plaintext" ok

    decrypted="$(age -d -i "$tmp/key.txt" "$tmp/plain.dump.age" 2>/dev/null)"
    [[ "$decrypted" == "$(cat "$tmp/plain.dump")" ]] \
      && report "the private key recovers the dump byte for byte" ok \
      || report "the private key recovers the dump byte for byte" fail "decrypted output differs"
  else
    report "age encrypts to a public key" fail "age -r failed for a freshly generated recipient"
  fi
else
  # Not a pass and not a failure: a statement, so nobody reads the total below as "encryption
  # verified" when the only executable check in this file did not run.
  echo "NOTE  age is not installed here, so the encryption round-trip did NOT run."
  echo "      The four checks above are source-level only. CI installs age so it runs there."
fi

echo
echo "passed=$passed failed=$failed"
[[ $failed -eq 0 ]]
