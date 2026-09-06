import assert from "node:assert/strict";
import { it } from "node:test";
import {
  evidenceAligns,
  parseAdapterSelectionEvidence,
  parseAdapterSelectionRecord,
} from "../semantic/adapter-selection/adapter-selection.js";
import type { AdapterSelectionRecord } from "../semantic/adapter-selection/adapter-selection-record.js";
import * as support from "../testing/adapter-selection-test-support.js";

it("binds each production authorization to the exact sentinel binary", () => {
  const recordInput = support.loadAdapterSelectionJson(
    "../../adapter-selection.json",
  ) as AdapterSelectionRecord;
  const evidenceInput = support.loadAdapterSelectionJson(
    "../../adapter-selection-evidence.json",
  );
  type RecordMutation = (record: AdapterSelectionRecord) => void;
  const cases: ReadonlyArray<readonly [string, RecordMutation]> = [
    [
      "selected executable",
      (record) =>
        (record.runtime_backends[0].platform_executables.win32 = "other.exe"),
    ],
    [
      "ordered entrypoints",
      (record) =>
        (record.runtime_backends[1].platform_entrypoints.win32 = ["other.js"]),
    ],
    [
      "executable digest",
      (record) =>
        (record.runtime_backends[0].authorization.executable_sha256 =
          "a".repeat(64)),
    ],
    [
      "entrypoint digest",
      (record) =>
        (record.runtime_backends[1].authorization.entrypoint_sha256s = [
          "a".repeat(64),
        ]),
    ],
    [
      "package metadata digest",
      (record) =>
        (record.runtime_backends[1].authorization.package_metadata_sha256 =
          "a".repeat(64)),
    ],
    [
      "trusted root list",
      (record) => (record.trusted_command_roots.win32 = ["npm_global"]),
    ],
    [
      "probe root",
      (record) =>
        (record.runtime_backends[0].authorization.version_probe.command_root =
          "node_install"),
    ],
    [
      "probe method",
      (record) =>
        (record.runtime_backends[0].authorization.version_probe.method =
          "package_json"),
    ],
    [
      "probe template",
      (record) => {
        const probe = record.runtime_backends[0].authorization.version_probe;
        probe.command_template = "other";
      },
    ],
    [
      "sentinel fixture",
      (record) =>
        (record.runtime_backends[0].sentinel_evidence.fixture_sha256 =
          "a".repeat(64)),
    ],
  ];
  for (const [label, mutate] of cases) {
    const record = structuredClone(recordInput);
    mutate(record);
    assert.equal(
      evidenceAligns(
        parseAdapterSelectionRecord(record),
        parseAdapterSelectionEvidence(evidenceInput),
      ),
      false,
      label,
    );
  }
});
