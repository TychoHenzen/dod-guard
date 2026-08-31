import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { fingerprintSnapshot } from "./fingerprint.js";
import { createFinding, failureResult, normalizeFindings } from "./types.js";
import type { Snapshot } from "./snapshot.js";

const snapshot: Snapshot = {
  baseIdentity: "base",
  targetIdentity: "index",
  changes: [{ kind: "modify", before: { path: "src/a.ts", content: "before" }, after: { path: "src/a.ts", content: "after" } }],
};

// covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Identical staged snapshot is analyzed twice
test("normalizes findings into stable identifiers and order", () => {
  const one = createFinding({ severity: "review", affectedPaths: ["b.ts", "a.ts"], before: { count: 1 }, after: { count: 2 }, reason: "growth" });
  const two = createFinding({ severity: "fail", affectedPaths: ["z.ts"], before: {}, after: {}, reason: "boundary" });
  const first = normalizeFindings([one, two]);
  const second = normalizeFindings([two, one]);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0]?.affectedPaths, ["a.ts", "b.ts"]);
  assert.match(first[0]?.id ?? "", /^[a-f0-9]{64}$/);
});

// covers: quality-guard/architecture-analysis :: Every finding is reproducible :: Required analysis cannot complete
test("required-analysis errors cannot return a clean decision", () => {
  const result = failureResult({ baseIdentity: "base", targetIdentity: "index", changedSourcePaths: ["src/a.ts"] }, "cannot read staged source");
  assert.equal(result.verdict, "FAIL");
  assert.deepEqual(result.errors, ["cannot read staged source"]);
});

// covers: quality-guard/commit-gate :: Architectural acknowledgements bind to staged content :: Source changes after acknowledgement
test("fingerprint excludes only the tracked decision record and changes for source or configuration", () => {
  const config = parseQualityConfig("{}");
  const original = fingerprintSnapshot(snapshot, config);
  const withDecisionRecord: Snapshot = {
    ...snapshot,
    changes: [...snapshot.changes, { kind: "modify", before: { path: ".github/quality/architecture-decisions.json", content: "[]" }, after: { path: ".github/quality/architecture-decisions.json", content: "[{}]" } }],
  };
  assert.equal(fingerprintSnapshot(withDecisionRecord, config), original);
  assert.notEqual(fingerprintSnapshot({ ...snapshot, changes: [{ kind: "modify", before: { path: "src/a.ts", content: "before" }, after: { path: "src/a.ts", content: "changed" } }] }, config), original);
  assert.notEqual(fingerprintSnapshot(snapshot, parseQualityConfig('{"directTypeLimit": 13}')), original);
});
