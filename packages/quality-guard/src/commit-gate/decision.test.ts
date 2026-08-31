import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { fingerprintSnapshot } from "./fingerprint.js";
import { createFinding, failureResult, normalizeFindings } from "./types.js";
import { decideQuality } from "./decision-core.js";
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

// covers: quality-guard/commit-gate :: Verdict states have fixed precedence :: Failure and review finding coexist
test("a deterministic failure wins while preserving review findings", () => {
  const result = decideQuality({
    snapshot,
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [{ severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" }] },
    hardBounds: [{ severity: "fail", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "bound" }],
  });
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.some((finding) => finding.severity === "review"));
  assert.ok(result.findings.some((finding) => finding.severity === "fail"));
});

// covers: quality-guard/commit-gate :: Verdict states have fixed precedence :: All evidence is accepted
test("accepted review evidence produces pass when deterministic checks pass", () => {
  const review = createFinding({ severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" });
  const result = decideQuality({
    snapshot,
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [{ severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" }] },
    acknowledgements: [review.id],
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.errors.length, 0);
});

// covers: quality-guard/commit-gate :: Architectural acknowledgements bind to staged content :: Finding is acknowledged for the current stage
test("current acknowledgement records accept only matching review findings", () => {
  const review = createFinding({ severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" });
  const result = decideQuality({
    snapshot,
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [{ severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" }] },
    acknowledgementRecords: [{ findingId: review.id, fingerprint: fingerprintSnapshot(snapshot, parseQualityConfig("{}")), reason: "Reviewed", author: "A. Reviewer", time: "2026-08-31T00:00:00.000Z" }],
  });
  assert.equal(result.verdict, "PASS");
  assert.deepEqual(result.staleAcknowledgements, []);
});

// covers: quality-guard/commit-gate :: Non-source commits report their limited scope :: Documentation-only commit
test("documentation-only changes report that no source decision was required", () => {
  const result = decideQuality({
    snapshot: { baseIdentity: "base", targetIdentity: "index", changes: [{ kind: "modify", before: { path: "README.md", content: "before" }, after: { path: "README.md", content: "after" } }] },
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [] },
  });
  assert.equal(result.verdict, "PASS");
  assert.match(result.input.reason ?? "", /No source quality decision was required/);
  assert.equal(result.findings.length, 0);
});
