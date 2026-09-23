import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import { runCheckCommand } from "../../../src/commit-gate/cli-command.js";
import { runStagedCheck } from "../../../src/commit-gate/cli-decision.js";
import {
  fixture,
  git,
  stagedReview,
} from "./acknowledgement-test-support.js";

const DECISION_RECORD = ".github/quality/architecture-decisions.json";
const MALFORMED_FINGERPRINT_ERROR = new RegExp(
  "architecture-decisions\\.json\\[0\\]\\.fingerprint must be a " +
    "64-character lowercase hexadecimal SHA-256 fingerprint",
);
const HISTORICAL_RECORD = JSON.stringify([
  {
    findingId: "historical-finding",
    fingerprint: "a".repeat(64),
    reason: "Previously reviewed",
    author: "tester",
    time: "2026-08-31T00:00:00.000Z",
  },
]);
const MALFORMED_RECORD = JSON.stringify([
  {
    findingId: "historical-finding",
    fingerprint: "short",
    reason: "Previously reviewed",
    author: "tester",
    time: "2026-08-31T00:00:00.000Z",
  },
]);

function stageDecisionRecord(root: string, source: string) {
  fs.writeFileSync(`${root}/${DECISION_RECORD}`, source);
  git(root, ["add", DECISION_RECORD]);
}

function assertMalformedRecordUsage(
  result: { exitCode: number; output: string },
) {
  assert.equal(result.exitCode, 3);
  assert.match(result.output, MALFORMED_FINGERPRINT_ERROR);
}

test(
  "keeps valid historical tracked records outside current matching",
  () => {
    const root = fixture();
    try {
      stagedReview(root);
      stageDecisionRecord(root, HISTORICAL_RECORD);
      const decision = runStagedCheck(root, { json: false, intent: "change" });
      assert.equal(decision.verdict, "REVIEW_REQUIRED");
      assert.deepEqual(decision.staleAcknowledgements, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "fails the staged command on malformed tracked fingerprints",
  () => {
    const root = fixture();
    try {
      stagedReview(root);
      stageDecisionRecord(root, MALFORMED_RECORD);
      assertMalformedRecordUsage(
        runCheckCommand(["check", "--staged", "--json"], root),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "fails the committed command on malformed tracked fingerprints",
  () => {
    const root = fixture();
    try {
      stagedReview(root);
      stageDecisionRecord(root, MALFORMED_RECORD);
      git(root, ["commit", "-m", "malformed tracked decision record"]);
      assertMalformedRecordUsage(
        runCheckCommand(["check", "--committed", "HEAD", "--json"], root),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
