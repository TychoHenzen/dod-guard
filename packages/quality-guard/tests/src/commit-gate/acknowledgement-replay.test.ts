import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import { runCommittedCheck } from "../../../src/commit-gate/cli-decision.js";
import {
  acknowledge,
  fixture,
  git,
  stagedReview,
} from "./acknowledgement-test-support.js";

test("replays an acknowledged staged source snapshot after commit", () => {
  const root = fixture();
  try {
    const { decision: staged, finding } = stagedReview(root);
    assert.equal(acknowledge(root, finding.id).exitCode, 0);
    git(root, ["commit", "-m", "acknowledge"]);
    const committed = runCommittedCheck(root, "HEAD", {
      json: false,
      intent: "change",
    });
    assert.equal(committed.verdict, "PASS");
    assert.equal(committed.input.baseIdentity, staged.input.baseIdentity);
    assert.equal(committed.input.targetIdentity, staged.input.targetIdentity);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
