import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import { fingerprintSnapshot } from "./fingerprint.js";
import {
  growthDecisionInput,
  growthFinding,
  snapshot,
} from "./decision-fixtures.test.js";

test("a deterministic failure wins while preserving review findings", () => {
  const result = decideQuality({
    ...growthDecisionInput(),
    hardBounds: [
      {
        severity: "fail",
        affectedPaths: ["src/a.ts"],
        before: {},
        after: {},
        reason: "bound",
      },
    ],
  });
  assert.equal(result.verdict, "FAIL");
  assert.equal(result.findings.length, 2);
  assert.ok(result.findings.some((finding) => finding.severity === "review"));
  assert.ok(result.findings.some((finding) => finding.severity === "fail"));
});

test(
  "accepted review evidence produces pass when deterministic checks pass",
  () => {
  const result = decideQuality({
    ...growthDecisionInput(),
    acknowledgements: [growthFinding().id],
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.errors.length, 0);
});

test(
  "current acknowledgement records accept only matching review findings",
  () => {
  const review = growthFinding();
  const result = decideQuality({
    ...growthDecisionInput(),
    acknowledgementRecords: [
      {
        findingId: review.id,
        fingerprint: fingerprintSnapshot(snapshot, parseQualityConfig("{}")),
        reason: "Reviewed",
        author: "A. Reviewer",
        time: "2026-08-31T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.verdict, "PASS");
  assert.deepEqual(result.staleAcknowledgements, []);
});

test(
  "documentation-only changes report that no source decision was required",
  () => {
  const result = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "index",
      changes: [
        {
          kind: "modify",
          before: { path: "README.md", content: "before" },
          after: { path: "README.md", content: "after" },
        },
      ],
    },
    config: parseQualityConfig("{}"),
    beforeFiles: [],
    afterFiles: [],
    scanner: { findings: [] },
  });
  assert.equal(result.verdict, "PASS");
  assert.match(
    result.input.reason ?? "",
    /No source quality decision was required/,
  );
  assert.equal(result.findings.length, 0);
});
