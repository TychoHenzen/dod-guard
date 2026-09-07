import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
  parseAdapterSelectionRecord,
} from "../semantic/adapter-selection/adapter-selection.js";

function unavailablePolicy(inspected: Array<readonly [string, string]>) {
  return createRuntimeLaunchPolicy({
    project_root: "/project",
    platform: "posix",
    inspect(languageName, executableBasename) {
      inspected.push([languageName, executableBasename]);
      return undefined;
    },
  });
}

it("loads only the checked-in runtime record when spike resources are available", () => {
  const record = loadAdapterSelectionRecord();
  const inspected: Array<readonly [string, string]> = [];
  const policy = unavailablePolicy(inspected);
  assert.equal(record.schema_version, 1);
  assert.deepEqual(record.selected_paths, {
    rust: "direct_standard_public_lsp",
    python: "direct_standard_public_lsp",
    csharp: "direct_standard_public_lsp",
  });
  assert.deepEqual(policy.prepare("rust"), {
    status: "unavailable",
    code: "backend_unavailable",
  });
  assert.deepEqual(inspected, [["rust", "rust-analyzer"]]);
});

it("does not substitute an unrecorded C# server when the approved executable is unavailable", () => {
  const inspected: Array<readonly [string, string]> = [];
  const policy = unavailablePolicy(inspected);
  assert.deepEqual(policy.prepare("csharp"), {
    status: "unavailable",
    code: "backend_unavailable",
  });
  assert.deepEqual(inspected, [["csharp", "roslyn-language-server"]]);
});

it("rejects incomplete, duplicate, and unknown selection record fields", () => {
  const record = JSON.parse(JSON.stringify(loadAdapterSelectionRecord())) as Record<string, unknown>;
  assert.throws(
    () =>
      parseAdapterSelectionRecord({
        ...record,
        unknown: true,
      }),
    /invalid adapter selection record/,
  );
  assert.throws(
    () =>
      parseAdapterSelectionRecord({
        ...record,
        runtime_backends: [(record.runtime_backends as unknown[])[0]],
      }),
    /invalid adapter selection record/,
  );
  assert.throws(
    () =>
      parseAdapterSelectionRecord({
        ...record,
        trusted_command_roots: {
          win32: [],
          posix: ["/opt/code-explorer"],
        },
      }),
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
    createRuntimeLaunchPolicy({
      project_root: "/project",
      platform: "posix",
      inspect: () => undefined,
    }).prepare("rust").status,
    "unavailable",
  );
});
