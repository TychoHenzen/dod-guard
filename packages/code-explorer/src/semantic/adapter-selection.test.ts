import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createRuntimeLaunchPolicy,
  evidenceAligns,
  loadAdapterSelectionRecord,
  parseAdapterSelectionEvidence,
  parseAdapterSelectionRecord,
} from "./adapter-selection.js";
import { createBackendStatusReport } from "./backend-status.js";
import { createNativeProjectRoot } from "./project-root.js";
import { createRuntimeAdapters } from "./runtime-bootstrap.js";

// covers: code-explorer/language-adapters :: Production runtime uses a checked-in adapter selection record :: Runtime starts without spike dependencies
it("loads only the checked-in runtime record when spike resources are absent", () => {
  const record = loadAdapterSelectionRecord();
  const inspected: Array<readonly [string, string]> = [];
  const policy = createRuntimeLaunchPolicy({
    project_root: "/project",
    platform: "posix",
    inspect(language, executableBasename) {
      inspected.push([language, executableBasename]);
      return undefined;
    },
  });

  assert.equal(record.schema_version, 1);
  assert.deepEqual(record.selected_paths, {
    rust: "direct_standard_public_lsp",
    python: "direct_standard_public_lsp",
    csharp: "direct_standard_public_lsp",
  });
  assert.deepEqual(policy.prepare("rust"), { status: "unavailable", code: "backend_unavailable" });
  assert.deepEqual(inspected, [["rust", "rust-analyzer"]]);
});

// covers: code-explorer/language-adapters :: Production runtime uses a checked-in adapter selection record :: Approved C# executable is absent
it("does not substitute an unrecorded C# server when the approved executable is absent", () => {
  const inspected: Array<readonly [string, string]> = [];
  const policy = createRuntimeLaunchPolicy({
    project_root: "/project",
    platform: "posix",
    inspect(language, executableBasename) {
      inspected.push([language, executableBasename]);
      return undefined;
    },
  });

  assert.deepEqual(policy.prepare("csharp"), { status: "unavailable", code: "backend_unavailable" });
  assert.deepEqual(inspected, [["csharp", "roslyn-language-server"]]);
});

it("rejects incomplete, duplicate, and unknown selection record fields", () => {
  const record = JSON.parse(JSON.stringify(loadAdapterSelectionRecord())) as Record<string, unknown>;
  assert.throws(() => parseAdapterSelectionRecord({ ...record, unknown: true }), /invalid adapter selection record/);
  assert.throws(
    () => parseAdapterSelectionRecord({ ...record, runtime_backends: [(record.runtime_backends as unknown[])[0]] }),
    /invalid adapter selection record/,
  );
  assert.throws(
    () =>
      parseAdapterSelectionRecord({ ...record, trusted_command_roots: { win32: [], posix: ["/opt/code-explorer"] } }),
    /invalid adapter selection record/,
  );
});

it("never lets Win32 sentinel evidence authorize a POSIX allowlist", () => {
  const record = loadAdapterSelectionRecord();
  assert.equal(
    record.runtime_backends.every((backend) => backend.sentinel_evidence.platform === "win32"),
    true,
  );
  assert.equal(
    createRuntimeLaunchPolicy({ project_root: "/project", platform: "posix", inspect: () => undefined }).prepare("rust")
      .status,
    "unavailable",
  );
});

it("binds each production authorization to the exact sentinel binary, entrypoint, roots, and version probe", () => {
  const recordInput = loadJson("../../adapter-selection.json");
  const evidenceInput = loadJson("../../adapter-selection-evidence.json");

  const cases: ReadonlyArray<readonly [string, (record: any, evidence: any) => void]> = [
    ["selected executable", (record) => (record.runtime_backends[0].platform_executables.win32 = "other.exe")],
    ["ordered entrypoints", (record) => (record.runtime_backends[1].platform_entrypoints.win32 = ["other.js"])],
    ["executable digest", (record) => (record.runtime_backends[0].authorization.executable_sha256 = "a".repeat(64))],
    ["entrypoint digest", (record) => (record.runtime_backends[1].authorization.entrypoint_sha256s = ["a".repeat(64)])],
    [
      "package metadata digest",
      (record) => (record.runtime_backends[1].authorization.package_metadata_sha256 = "a".repeat(64)),
    ],
    ["trusted root list", (record) => (record.trusted_command_roots.win32 = ["npm_global"])],
    ["probe root", (record) => (record.runtime_backends[0].authorization.version_probe.command_root = "node_install")],
    ["probe method", (record) => (record.runtime_backends[0].authorization.version_probe.method = "package_json")],
    ["probe template", (record) => (record.runtime_backends[0].authorization.version_probe.command_template = "other")],
    ["sentinel fixture", (record) => (record.runtime_backends[0].sentinel_evidence.fixture_sha256 = "a".repeat(64))],
    ["measured executable", (_record, evidence) => (evidence.sentinel_runs.rust.executable = "other.exe")],
    ["measured ordered entrypoints", (_record, evidence) => (evidence.sentinel_runs.python.entrypoints = ["other.js"])],
    [
      "measured executable digest",
      (_record, evidence) => (evidence.sentinel_runs.rust.executable_sha256 = "a".repeat(64)),
    ],
    [
      "measured entrypoint digest",
      (_record, evidence) => (evidence.sentinel_runs.python.entrypoint_sha256s = ["a".repeat(64)]),
    ],
    [
      "measured entrypoint digest count",
      (_record, evidence) => (evidence.sentinel_runs.python.entrypoint_sha256s = []),
    ],
    [
      "measured metadata digest",
      (_record, evidence) => (evidence.sentinel_runs.python.package_metadata_sha256 = "a".repeat(64)),
    ],
    ["measured root list", (_record, evidence) => (evidence.platforms.win32.command_roots = ["npm_global"])],
    [
      "measured probe method",
      (_record, evidence) => (evidence.sentinel_runs.rust.version_probe.method = "package_json"),
    ],
    ["platform pass state", (_record, evidence) => (evidence.platforms.win32.status = "unproven")],
  ];

  for (const [label, mutate] of cases) {
    const record = structuredClone(recordInput);
    const evidence = structuredClone(evidenceInput);
    mutate(record, evidence);
    assert.equal(
      evidenceAligns(parseAdapterSelectionRecord(record), parseAdapterSelectionEvidence(evidence)),
      false,
      label,
    );
  }
});

it("exposes one fail-closed status for every selected production language", () => {
  const statuses = createBackendStatusReport(createRuntimeAdapters(createNativeProjectRoot(process.cwd()))).backends;
  assert.deepEqual(
    statuses.map((status) => status.language),
    ["rust", "python", "csharp"],
  );
  const csharp = statuses.find((status) => status.language === "csharp");
  assert.ok(csharp?.state === "initializing" || csharp?.state === "unavailable");
  if (csharp?.state === "unavailable") assert.equal(csharp.failure_code, "backend_unavailable");
});

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"));
}
