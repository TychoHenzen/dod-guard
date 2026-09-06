import assert from "node:assert/strict";
import { it } from "node:test";
import * as support from "../testing/adapter-selection-test-support.js";
import {
  evidenceAligns,
  parseAdapterSelectionEvidence,
  parseAdapterSelectionRecord,
} from "./adapter-selection.js";

it("rejects measured evidence when any runtime authorization field c", () => {
  const recordInput = support.loadAdapterSelectionJson(
    "../../adapter-selection.json",
  );
  const evidenceInput = support.loadAdapterSelectionJson(
    "../../adapter-selection-evidence.json",
  );
  const cases: ReadonlyArray<readonly [string, (evidence: any) => void]> = [
    [
      "measured executable",
      (evidence) => (evidence.sentinel_runs.rust.executable = "other.exe"),
    ],
    [
      "measured ordered entrypoints",
      (evidence) => (evidence.sentinel_runs.python.entrypoints = ["other.js"]),
    ],
    [
      "measured executable digest",
      (evidence) =>
        (evidence.sentinel_runs.rust.executable_sha256 = "a".repeat(64)),
    ],
    [
      "measured entrypoint digest",
      (evidence) =>
        (evidence.sentinel_runs.python.entrypoint_sha256s = ["a".repeat(64)]),
    ],
    [
      "measured entrypoint digest count",
      (evidence) => (evidence.sentinel_runs.python.entrypoint_sha256s = []),
    ],
    [
      "measured metadata digest",
      (evidence) =>
        (evidence.sentinel_runs.python.package_metadata_sha256 = "a".repeat(
          64,
        )),
    ],
    [
      "measured root list",
      (evidence) => (evidence.platforms.win32.command_roots = ["npm_global"]),
    ],
    [
      "measured probe method",
      (evidence) =>
        (evidence.sentinel_runs.rust.version_probe.method = "package_json"),
    ],
    [
      "platform pass state",
      (evidence) => (evidence.platforms.win32.status = "unproven"),
    ],
  ];
  for (const [label, mutate] of cases) {
    const record = structuredClone(recordInput);
    const evidence = structuredClone(evidenceInput);
    mutate(evidence);
    assert.equal(
      evidenceAligns(
        parseAdapterSelectionRecord(record),
        parseAdapterSelectionEvidence(evidence),
      ),
      false,
      label,
    );
  }
});
