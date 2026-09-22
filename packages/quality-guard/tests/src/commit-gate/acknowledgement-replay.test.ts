import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import {
  runCommittedCheck,
  runStagedCheck,
} from "../../../src/commit-gate/cli-decision.js";
import { writeQualityDecisionNote } from "../../../src/commit-gate/quality-decision-notes.js";
import {
  acknowledge,
  fixture,
  git,
  stagedReview,
} from "./acknowledgement-test-support.js";

test("requires an exact-commit note after a staged acknowledgement intent", () => {
  const root = fixture();
  try {
    const { decision: staged, finding } = stagedReview(root);
    assert.equal(acknowledge(root, finding.id).exitCode, 0);
    assert.equal(
      runStagedCheck(root, { json: false, intent: "change" }).verdict,
      "PASS",
    );
    git(root, ["commit", "-m", "acknowledge"]);
    const beforeAttestation = runCommittedCheck(root, "HEAD", {
      json: false,
      intent: "change",
    });
    assert.equal(beforeAttestation.verdict, "REVIEW_REQUIRED");
    writeQualityDecisionNote(root, {
      findingId: finding.id,
      fingerprint: beforeAttestation.fingerprint ?? "",
      baseSha: beforeAttestation.input.baseIdentity,
      targetSha: git(root, ["rev-parse", "HEAD"]),
      reason: "accepted test finding",
      author: "tester",
      time: "2026-09-22T00:00:00.000Z",
    });
    const committed = runCommittedCheck(root, "HEAD", {
      json: false,
      intent: "change",
    });
    assert.equal(committed.verdict, "PASS");
    assert.equal(committed.input.baseIdentity, staged.input.baseIdentity);
    assert.equal(
      committed.input.targetCommitSha,
      git(root, ["rev-parse", "HEAD"]),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
