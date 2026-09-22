import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";
import { decideQuality } from "../../../src/commit-gate/decision-core.js";
import { fingerprintSnapshot } from "../../../src/commit-gate/fingerprint.js";
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

test("accepted review evidence passes deterministic checks", () => {
  const result = decideQuality({
    ...growthDecisionInput(),
    acknowledgements: [growthFinding().id],
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.errors.length, 0);
});

test("matching exact-commit attestations pass", () => {
  const review = growthFinding();
  const result = decideQuality({
    ...growthDecisionInput(),
    attestations: [
      {
        findingId: review.id,
        fingerprint: fingerprintSnapshot(snapshot, parseQualityConfig("{}")),
        baseSha: snapshot.baseIdentity,
        targetSha: snapshot.targetCommitSha ?? "",
        reason: "Reviewed",
        author: "A. Reviewer",
        time: "2026-08-31T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.verdict, "PASS");
  assert.deepEqual(result.staleAcknowledgements, []);
});

test("treats a mismatched attestation as stale provenance", () => {
  const review = growthFinding();
  const result = decideQuality({
    ...growthDecisionInput(),
    attestations: [
      {
        findingId: review.id,
        fingerprint: fingerprintSnapshot(snapshot, parseQualityConfig("{}")),
        baseSha: "old-base",
        targetSha: "old-target",
        reason: "Reviewed",
        author: "A. Reviewer",
        time: "2026-08-31T00:00:00.000Z",
      },
    ],
  });
  assert.equal(result.verdict, "REVIEW_REQUIRED");
  assert.deepEqual(result.staleAcknowledgements, [
    {
      findingId: review.id,
      baseIdentity: "old-base",
      targetIdentity: "old-target",
    },
  ]);
});
