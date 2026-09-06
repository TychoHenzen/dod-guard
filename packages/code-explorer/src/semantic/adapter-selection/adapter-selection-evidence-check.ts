import {
  arraysEqual,
  versionProbeMatches,
} from "./adapter-selection-comparison.js";
import type { AdapterSelectionEvidence } from "./adapter-selection-evidence.js";
import type { AdapterSelectionRecord } from "./adapter-selection-record.js";

export function evidenceAligns(
  record: AdapterSelectionRecord,
  evidence: AdapterSelectionEvidence,
): boolean {
  return (
    record.runtime_backends.every((backend) =>
      backendEvidenceAligns({ backend, record, evidence }),
    ) &&
    arraysEqual(
      record.trusted_command_roots.win32,
      evidence.platforms.win32.command_roots,
    ) &&
    arraysEqual(
      record.trusted_command_roots.posix,
      evidence.platforms.posix.command_roots,
    )
  );
}

function backendEvidenceAligns(input: {
  backend: AdapterSelectionRecord["runtime_backends"][number];
  record: AdapterSelectionRecord;
  evidence: AdapterSelectionEvidence;
}): boolean {
  const backend = input.backend;
  const run = input.evidence.sentinel_runs[backend.language];
  const platform = input.evidence.platforms[backend.sentinel_evidence.platform];
  return [
    fixtureMatches(backend, input.evidence, run),
    backend.compatible_version === run.backend_version,
    backend.platform_executables[backend.sentinel_evidence.platform] ===
      run.executable,
    entrypointsMatch(backend, run),
    authorizationMatches(backend, run),
    versionProbeMatches(backend, run),
    platform.command_roots.includes(
      backend.authorization.version_probe.command_root as never,
    ),
    backend.sentinel_evidence.passed ===
      (platform.status === "passed" && run.side_effect_absent),
  ].every(Boolean);
}

function fixtureMatches(
  backend: AdapterSelectionRecord["runtime_backends"][number],
  evidence: AdapterSelectionEvidence,
  run: AdapterSelectionEvidence["sentinel_runs"]["rust"],
): boolean {
  return (
    backend.sentinel_evidence.fixture_sha256 ===
      evidence.fixture_tree_hashes[backend.language] &&
    backend.sentinel_evidence.fixture_sha256 === run.fixture_sha256
  );
}

function entrypointsMatch(
  backend: AdapterSelectionRecord["runtime_backends"][number],
  run: AdapterSelectionEvidence["sentinel_runs"]["rust"],
): boolean {
  const platform = backend.sentinel_evidence.platform;
  return (
    arraysEqual(backend.platform_entrypoints[platform], run.entrypoints) &&
    backend.platform_entrypoints[platform].length ===
      backend.authorization.entrypoint_sha256s.length &&
    run.entrypoints.length === run.entrypoint_sha256s.length
  );
}

function authorizationMatches(
  backend: AdapterSelectionRecord["runtime_backends"][number],
  run: AdapterSelectionEvidence["sentinel_runs"]["rust"],
): boolean {
  return (
    backend.authorization.executable_sha256 === run.executable_sha256 &&
    arraysEqual(
      backend.authorization.entrypoint_sha256s,
      run.entrypoint_sha256s,
    ) &&
    backend.authorization.package_metadata_sha256 ===
      run.package_metadata_sha256 &&
    (backend.language === "python"
      ? backend.authorization.package_metadata_sha256 !== null
      : backend.authorization.package_metadata_sha256 === null)
  );
}
