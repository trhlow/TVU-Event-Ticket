# .github/scripts/collect-secret-scan.py
"""Wraps crane + Trivy to produce layerSecretScan/filesystemSecretScan predicate documents.

filesystemSecretScan flattens the image (crane export, whiteouts applied -- that is what flatten
means) and scans the merged tree. layerSecretScan extracts every layer separately (crane blob per
layer digest, whiteouts deliberately ignored -- that is the point of a per-layer scan: it catches a
secret deleted in a later layer but still physically present in the image). Both scan with
`trivy fs --scanners secret`, confirmed for real (design doc section 3.3b) to omit the
Results[].Class == "secret" entry entirely -- not an empty Secrets array -- when nothing is found.
"""
import datetime
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import tarfile
import tempfile

_HERE = pathlib.Path(__file__).resolve().parent
_registry_spec = importlib.util.spec_from_file_location("local_registry", _HERE / "local-registry.py")
_registry_module = importlib.util.module_from_spec(_registry_spec)
_registry_spec.loader.exec_module(_registry_module)
local_registry_ref = _registry_module.local_registry_ref

__all__ = ["collect_filesystem_secret_scan", "collect_layer_secret_scan", "CollectorError"]

MAX_FINDINGS = 100
SCAN_TIMEOUT_SECONDS = 20 * 60  # design doc 3.3a: 20 minutes per extract+scan


class CollectorError(Exception):
    pass


def _ruleset_descriptor(ruleset_path: str) -> dict:
    text = pathlib.Path(ruleset_path).read_bytes()
    # version: "1" is read out of the tracked file's own YAML rather than hardcoded here, so a real
    # edit to the file (and its version bump) is the only way this value ever changes -- no separate
    # ledger to fall out of sync with the bytes actually hashed.
    version = None
    for line in text.decode("utf-8").splitlines():
        if line.strip().startswith("version:"):
            version = line.split(":", 1)[1].strip().strip('"')
            break
    if version is None:
        raise CollectorError(f"{ruleset_path} has no top-level 'version:' line")
    digest = "sha256:" + hashlib.sha256(text).hexdigest()
    return {"version": version, "digest": digest}


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_trivy_fs_secret(tree_path: str, ruleset_path: str) -> list:
    """Returns the raw findings list (list of {"severity", "fixAvailable"} dicts), honoring the
    confirmed-real quirk that a Class:"secret" Results entry is entirely absent when nothing is found."""
    try:
        proc = subprocess.run(
            ["trivy", "fs", "--scanners", "secret", "--secret-config", ruleset_path,
             "--format", "json", "--quiet", tree_path],
            capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
        )
    except FileNotFoundError as exc:
        raise CollectorError(f"trivy is not on PATH: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise CollectorError(f"trivy fs timed out scanning {tree_path} (cap: {SCAN_TIMEOUT_SECONDS}s)") from exc

    if proc.returncode != 0:
        raise CollectorError(f"trivy fs exited {proc.returncode} scanning {tree_path}: "
                              f"{proc.stderr.strip()[:2000]}")

    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"trivy fs did not print valid JSON: {exc}") from exc

    findings = []
    for result in raw.get("Results") or []:
        if result.get("Class") != "secret":
            continue  # e.g. the incidental "os-pkgs" entry Trivy always emits -- not a finding source
        for secret in result.get("Secrets") or []:
            findings.append({
                "severity": secret.get("Severity", "UNKNOWN"),
                "fixAvailable": False,  # a leaked secret has no "fixed version"; always false by kind
            })
    return findings


def _cap_findings(all_findings: list) -> tuple:
    truncated = len(all_findings) > MAX_FINDINGS
    return all_findings[:MAX_FINDINGS], truncated


def collect_filesystem_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict:
    ruleset = _ruleset_descriptor(ruleset_path)

    with local_registry_ref(tarball_path, image_name) as ref:
        with tempfile.TemporaryDirectory(prefix="fs-secret-scan-") as workdir:
            workdir_path = pathlib.Path(workdir)
            export_tar = workdir_path / "flat.tar"

            export_proc = subprocess.run(
                ["crane", "export", ref, str(export_tar)],
                capture_output=True, text=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
            )
            if export_proc.returncode != 0:
                raise CollectorError(f"crane export exited {export_proc.returncode}: "
                                      f"{export_proc.stderr.strip()[:2000]}")

            extracted_dir = workdir_path / "extracted"
            extracted_dir.mkdir()
            try:
                with tarfile.open(export_tar) as tf:
                    # Observed for real (not Windows-specific, contrary to the informal design-time
                    # note -- this reproduces identically on any OS with this Python/tarfile version):
                    # crane export's flattened rootfs contains absolute-target symlinks (e.g. busybox's
                    # "bin/arch" -> "/bin/busybox"), which Python 3.12's tarfile "data" filter (PEP 706)
                    # refuses via AbsoluteLinkError even though the symlink itself is never dereferenced
                    # outside the destination directory during extraction. The "tar" filter keeps the
                    # guard that actually matters for untrusted archive content -- absolute *member*
                    # paths and path traversal outside the destination (OutsideDestinationError) -- and
                    # simply does not reject absolute *link targets*, which is what this fixture needs.
                    tf.extractall(extracted_dir, filter="tar")
            except (tarfile.TarError, OSError) as exc:
                raise CollectorError(f"{export_tar} did not extract cleanly: {exc}") from exc

            all_findings = _run_trivy_fs_secret(str(extracted_dir), ruleset_path)

    findings, truncated = _cap_findings(all_findings)

    return {
        "scanner": {"name": "trivy", "version": _trivy_version()},
        "ruleset": ruleset,
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }


def _trivy_version() -> str:
    proc = subprocess.run(["trivy", "--version"], capture_output=True, text=True, timeout=30,
                           check=False)
    for line in proc.stdout.splitlines():
        if line.strip().startswith("Version:"):
            return line.split(":", 1)[1].strip()
    return "unknown"


TOTAL_LAYER_COMPRESSED_CAP = 8 * 1024 ** 3       # 8 GiB
ONE_LAYER_COMPRESSED_CAP = 2 * 1024 ** 3         # 2 GiB
TOTAL_DECOMPRESSED_CAP = 24 * 1024 ** 3          # 24 GiB
MAX_EXTRACTED_FILE_COUNT = 2_000_000


def collect_layer_secret_scan(tarball_path: str, image_name: str, ruleset_path: str) -> dict:
    ruleset = _ruleset_descriptor(ruleset_path)

    with local_registry_ref(tarball_path, image_name) as ref:
        manifest_proc = subprocess.run(
            ["crane", "manifest", ref], capture_output=True, text=True, timeout=30, check=False,
        )
        if manifest_proc.returncode != 0:
            raise CollectorError(f"crane manifest exited {manifest_proc.returncode}: "
                                  f"{manifest_proc.stderr.strip()[:2000]}")
        try:
            manifest = json.loads(manifest_proc.stdout)
        except json.JSONDecodeError as exc:
            raise CollectorError(f"crane manifest did not print valid JSON: {exc}") from exc

        layers = manifest.get("layers") or []
        if not layers:
            raise CollectorError(f"{ref}'s manifest declares no layers")

        # Size-before-hash discipline (design doc 3.3a / 3a section 2): every declared size is
        # checked against its cap BEFORE any blob is downloaded, not after.
        total_declared = 0
        for layer in layers:
            size = layer.get("size")
            if not isinstance(size, int) or size < 0:
                raise CollectorError(f"{ref}'s manifest declares a layer with an invalid size: {layer!r}")
            if size > ONE_LAYER_COMPRESSED_CAP:
                raise CollectorError(
                    f"{ref}'s layer {layer.get('digest')} declares size {size} bytes, over the "
                    f"{ONE_LAYER_COMPRESSED_CAP} byte per-layer cap -- refusing to download"
                )
            total_declared += size
        if total_declared > TOTAL_LAYER_COMPRESSED_CAP:
            raise CollectorError(
                f"{ref}'s layers declare {total_declared} bytes total, over the "
                f"{TOTAL_LAYER_COMPRESSED_CAP} byte total-compressed cap -- refusing to download"
            )

        all_findings = []
        for layer in layers:
            digest = layer["digest"]
            with tempfile.TemporaryDirectory(prefix="layer-secret-scan-") as workdir:
                workdir_path = pathlib.Path(workdir)
                blob_path = workdir_path / "layer.tar.gz"

                blob_proc = subprocess.run(
                    ["crane", "blob", f"{ref}@{digest}"],
                    capture_output=True, timeout=SCAN_TIMEOUT_SECONDS, check=False,
                )
                if blob_proc.returncode != 0:
                    raise CollectorError(f"crane blob exited {blob_proc.returncode} for {digest}: "
                                          f"{blob_proc.stderr.decode('utf-8', 'replace')[:2000]}")
                blob_path.write_bytes(blob_proc.stdout)

                extracted_dir = workdir_path / "extracted"
                extracted_dir.mkdir()
                total_extracted_bytes = 0
                file_count = 0
                try:
                    with tarfile.open(blob_path, mode="r:gz") as tf:
                        for member in tf:
                            if member.isfile():
                                total_extracted_bytes += member.size
                                file_count += 1
                            if total_extracted_bytes > TOTAL_DECOMPRESSED_CAP:
                                raise CollectorError(
                                    f"layer {digest} exceeded the {TOTAL_DECOMPRESSED_CAP} byte "
                                    f"decompressed cap while extracting -- stopping immediately"
                                )
                            if file_count > MAX_EXTRACTED_FILE_COUNT:
                                raise CollectorError(
                                    f"layer {digest} exceeded the {MAX_EXTRACTED_FILE_COUNT} file "
                                    f"cap while extracting -- stopping immediately"
                                )
                        # filter="tar", not "data": Task 2 found for real that this image's absolute-
                        # target symlinks (e.g. busybox's bin/arch -> /bin/busybox) trip Python 3.12's
                        # "data" filter's AbsoluteLinkError, on any OS -- not a Windows-only quirk as
                        # first assumed. "tar" keeps the guard that matters for untrusted content
                        # (absolute *member* paths, path traversal) without rejecting absolute link
                        # *targets*. See collect_filesystem_secret_scan's own comment for the full
                        # reasoning; use the identical filter here for the identical reason.
                        tf.extractall(extracted_dir, filter="tar")
                except (tarfile.TarError, OSError) as exc:
                    raise CollectorError(f"layer {digest} did not extract as a tar/gzip stream: {exc}") from exc

                # Whiteouts are deliberately NOT applied here -- that is the entire point of a
                # per-layer scan (design doc 3.3: catches a secret deleted in a later layer, still
                # present and extractable in this one).
                all_findings.extend(_run_trivy_fs_secret(str(extracted_dir), ruleset_path))

    findings, truncated = _cap_findings(all_findings)

    return {
        "scanner": {"name": "trivy", "version": _trivy_version()},
        "ruleset": ruleset,
        "target": image_name,
        "timestamp": _now_iso(),
        "findings": findings,
        "truncated": truncated,
    }
