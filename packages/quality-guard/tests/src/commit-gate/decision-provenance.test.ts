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

test("reports only stale provenance for findings in the current decision", () => {
  const review = growthFinding();
  const result = decideQuality({
    ...growthDecisionInput(),
    pendingAcknowledgementRecords: [
      {
        findingId: "historical-finding",
        fingerprint: "old-fingerprint",
        reason: "Previously reviewed",
        author: "A. Reviewer",
        time: "2026-08-31T00:00:00.000Z",
      },
    ],
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
      {
        findingId: "historical-finding",
        fingerprint: "old-fingerprint",
        baseSha: "old-base",
        targetSha: "old-target",
        reason: "Previously reviewed",
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
