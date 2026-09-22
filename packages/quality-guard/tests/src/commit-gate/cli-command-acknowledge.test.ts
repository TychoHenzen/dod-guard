import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import {
  currentCommittedReviewFinding,
  runAcknowledgeCommand,
} from "../../../src/commit-gate/cli-command-acknowledge.js";
import { runStagedCheck } from "../../../src/commit-gate/cli-decision.js";
import { readQualityDecisionNotes } from "../../../src/commit-gate/quality-decision-notes.js";
import {
  acknowledge,
  fixture,
  git,
  stagedReview,
} from "./acknowledgement-test-support.js";

test("reports invalid acknowledgement command arguments", () => {
  const result = runAcknowledgeCommand(["acknowledge"], process.cwd());
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /--finding requires/);
});

test("writes an exact-head note for a current committed review finding", () => {
  const root = fixture();
  try {
    const { finding } = stagedReview(root);
    git(root, ["commit", "-m", "review finding"]);
    const result = runAcknowledgeCommand(
      [
        "acknowledge",
        "--finding",
        finding.id,
        "--reason",
        "reviewed",
        "--author",
        "tester",
        "--committed",
        "HEAD",
      ],
      root,
    );
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects deterministic committed findings", () => {
  const result = currentCommittedReviewFinding(
    {
      verdict: "FAIL",
      findings: [
        {
          id: "deterministic",
          severity: "fail",
          affectedPaths: ["src/a.ts"],
          before: {},
          after: {},
          reason: "deterministic",
        },
      ],
      errors: [],
      input: {
        baseIdentity: "base",
        targetIdentity: "target",
        changedSourcePaths: ["src/a.ts"],
      },
    },
    "deterministic",
  );
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match(
    "output" in result ? result.output : "",
    /deterministic and cannot be acknowledged/,
  );
});

test("rejects unknown committed findings", () => {
  const root = fixture();
  try {
    const { finding } = stagedReview(root);
    git(root, ["commit", "-m", "review finding"]);
    const result = runAcknowledgeCommand(
      [
        "acknowledge",
        "--finding",
        `${finding.id}-stale`,
        "--reason",
        "reviewed",
        "--author",
        "tester",
        "--committed",
        "HEAD",
      ],
      root,
    );
    assert.equal(result.exitCode, 3);
    assert.match(result.output, /unknown or stale/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    assert.equal(
      runStagedCheck(root, { json: false, intent: "change" }).verdict,
      "PASS",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
