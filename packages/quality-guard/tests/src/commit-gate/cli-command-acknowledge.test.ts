import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { runAcknowledgeCommand } from "../../../src/commit-gate/cli-command-acknowledge.js";
import {
  acknowledge,
  fixture,
  stagedReview,
} from "./acknowledgement-test-support.js";

test("reports invalid acknowledgement command arguments", () => {
  const result = runAcknowledgeCommand(["acknowledge"], process.cwd());
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /--finding requires/);
});

test("writes an acknowledgement for a staged review finding", () => {
  const root = fixture();
  try {
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
