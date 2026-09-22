import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { runAcknowledgeCommand } from "../../../src/commit-gate/cli-command-acknowledge.js";
import { findStagedAcknowledgement } from "../../../src/commit-gate/cli-command-acknowledge-evidence.js";
import { runStagedCheck } from "../../../src/commit-gate/cli-decision.js";
import { readQualityDecisionNotes } from "../../../src/commit-gate/quality-decision-notes.js";
import {
  acknowledge,
  failingDecision,
  git,
  stagedReview,
  withFixture,
} from "./acknowledgement-test-support.js";

test(
  "writes an exact-head note for a current committed review finding",
  withFixture((root) => {
    const { finding } = stagedReview(root);
    git(root, ["commit", "-m", "review finding"]);
    const result = acknowledge(root, finding.id, {
      reason: "reviewed",
      committedRef: "HEAD",
    });
    const targetSha = git(root, ["rev-parse", "HEAD"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /refs\/notes\/quality-decisions/);
    assert.match(
      result.output,
      /git push origin refs\/notes\/quality-decisions/,
    );
    const [record] = readQualityDecisionNotes(root, targetSha);
    assert.equal(record?.findingId, finding.id);
    assert.match(record?.fingerprint ?? "", /^[0-9a-f]{64}$/);
    assert.equal(record?.baseSha, git(root, ["rev-parse", "HEAD^"]));
    assert.equal(record?.targetSha, targetSha);
    assert.equal(record?.reason, "reviewed");
    assert.equal(record?.author, "tester");
  }),
);

test(
  "rejects incomplete, unknown, and deterministic acknowledgement requests",
  withFixture((root) => {
    const invalid = runAcknowledgeCommand(["acknowledge"], root);
    assert.equal(invalid.exitCode, 3);
    assert.match(invalid.output, /--finding requires/);
    const { decision, finding } = stagedReview(root);
    git(root, ["commit", "-m", "review finding"]);
    const result = acknowledge(root, `${finding.id}-stale`, {
      reason: "reviewed",
      committedRef: "HEAD",
    });
    assert.equal(result.exitCode, 3);
    assert.match(result.output, /unknown or stale/);
    const deterministic = findStagedAcknowledgement(failingDecision(decision), {
      findingId: finding.id,
      reason: "reviewed",
      author: "tester",
    });
    assert.equal("exitCode" in deterministic && deterministic.exitCode, 3);
    assert.match(
      "output" in deterministic ? deterministic.output : "",
      /deterministic and cannot be acknowledged/,
    );
  }),
);

test(
  "writes an acknowledgement for a staged review finding",
  withFixture((root) => {
    const { decision, finding } = stagedReview(root);
    const result = acknowledge(root, finding.id);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, new RegExp(finding.id));
    assert.match(
      fs.readFileSync(
        path.join(root, ".github", "quality", "architecture-decisions.json"),
        "utf8",
      ),
      new RegExp(finding.id),
    );
    const acknowledgement = JSON.parse(
      fs.readFileSync(
        path.join(root, ".github", "quality", "architecture-decisions.json"),
        "utf8",
      ),
    )[0];
    assert.equal(acknowledgement.baseIdentity, decision.input.baseIdentity);
    assert.equal(acknowledgement.targetIdentity, decision.input.targetIdentity);
    assert.equal(
      runStagedCheck(root, { json: false, intent: "change" }).verdict,
      "PASS",
    );
  }),
);
