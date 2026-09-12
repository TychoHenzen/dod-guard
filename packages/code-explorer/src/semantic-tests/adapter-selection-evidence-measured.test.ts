import assert from "node:assert/strict";
import { it } from "node:test";
import {
  type AdapterSelectionEvidence,
  type AdapterSelectionRecord,
  evidenceAligns,
  parseAdapterSelectionEvidence,
  parseAdapterSelectionRecord,
} from "../semantic/adapter-selection/adapter-selection.js";
import * as support from "../testing/backend/adapter-selection-test-support.js";

it("rejects measured evidence when any \
runtime authorization field changes", () => {
  const recordInput = support.loadAdapterSelectionJson(
    "../../../adapter-selection.json",
  ) as AdapterSelectionRecord;
  const evidenceInput = support.loadAdapterSelectionJson(
    "../../../adapter-selection-evidence.json",
  ) as AdapterSelectionEvidence;
  type EvidenceMutation = (evidence: AdapterSelectionEvidence) => void;
  const cases: ReadonlyArray<readonly [string, EvidenceMutation]> = [
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
