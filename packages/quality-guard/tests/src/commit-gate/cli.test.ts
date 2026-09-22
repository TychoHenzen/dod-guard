import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exitCodeFor,
  parseAcknowledgeArguments,
  parseCheckArguments,
  renderDecision,
} from "../../../src/commit-gate/cli.js";
import type { DecisionResult } from "../../../src/commit-gate/types.js";

const review: DecisionResult = {
  verdict: "REVIEW_REQUIRED",
  findings: [
    {
      id: "finding",
      severity: "review",
      affectedPaths: ["src/a.ts"],
      before: {},
      after: {},
      reason: "growth",
    },
  ],
  errors: [],
  input: {
    baseIdentity: "base",
    targetIdentity: "index",
    changedSourcePaths: ["src/a.ts"],
  },
};

const acknowledgeArguments = [
  "acknowledge",
  "--finding",
  "finding",
  "--reason",
  "Reviewed",
  "--author",
  "A. Reviewer",
];

test("parses the ordinary staged command with change intent", () => {
  assert.deepEqual(parseCheckArguments(["check", "--staged"]), {
    json: false,
    intent: "change",
    target: undefined,
  });
});

test("refactor intent without a target is a usage error", () => {
  const result = parseCheckArguments([
    "check",
    "--staged",
    "--intent",
    "refactor",
  ]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /requires --target/);
});

test("review-required maps to blocking output", () => {
  assert.equal(exitCodeFor(review), 2);
  assert.match(renderDecision(review, { json: false }), /^REVIEW_REQUIRED/m);
  assert.equal(
    JSON.parse(renderDecision(review, { json: true })).verdict,
    "REVIEW_REQUIRED",
  );
});

test("unsupported intent is a usage error", () => {
  const result = parseCheckArguments([
    "check",
    "--staged",
    "--intent=surprise",
  ]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /Usage/);
});

test("parses required and committed acknowledgement arguments", () => {
  assert.deepEqual(parseAcknowledgeArguments(acknowledgeArguments), {
    findingId: "finding",
    reason: "Reviewed",
    author: "A. Reviewer",
  });
  const missingReason = [...acknowledgeArguments];
  missingReason[4] = "";
  const result = parseAcknowledgeArguments(missingReason);
  assert.equal("exitCode" in result && result.exitCode, 3);

  assert.deepEqual(
    parseAcknowledgeArguments([...acknowledgeArguments, "--committed=HEAD"]),
    {
      findingId: "finding",
      reason: "Reviewed",
      author: "A. Reviewer",
      committedRef: "HEAD",
    },
  );
});
