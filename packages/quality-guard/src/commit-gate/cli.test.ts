import assert from "node:assert/strict";
import { test } from "node:test";
import { exitCodeFor, parseCheckArguments, renderDecision } from "./cli.js";
import type { DecisionResult } from "./types.js";

const review: DecisionResult = {
  verdict: "REVIEW_REQUIRED",
  findings: [{ id: "finding", severity: "review", affectedPaths: ["src/a.ts"], before: {}, after: {}, reason: "growth" }],
  errors: [],
  input: { baseIdentity: "base", targetIdentity: "index", changedSourcePaths: ["src/a.ts"] },
};

// covers: quality-guard/commit-gate :: One command judges the staged change :: Ordinary staged change is checked
test("parses the ordinary staged command with change intent", () => {
  assert.deepEqual(parseCheckArguments(["check", "--staged"]), { json: false, intent: "change", target: undefined });
});

// covers: quality-guard/commit-gate :: One command judges the staged change :: Refactor target is missing
test("refactor intent without a target is a usage error", () => {
  const result = parseCheckArguments(["check", "--staged", "--intent", "refactor"]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /requires --target/);
});

// covers: quality-guard/commit-gate :: Process exit codes preserve the verdict :: Review blocks a Git hook
test("review-required maps to hook-blocking exit code and matching renderers", () => {
  assert.equal(exitCodeFor(review), 2);
  assert.match(renderDecision(review, false), /^REVIEW_REQUIRED/m);
  assert.equal(JSON.parse(renderDecision(review, true)).verdict, "REVIEW_REQUIRED");
});

// covers: quality-guard/commit-gate :: Process exit codes preserve the verdict :: Invalid option is passed
test("unsupported intent is a usage error", () => {
  const result = parseCheckArguments(["check", "--staged", "--intent=surprise"]);
  assert.equal("exitCode" in result && result.exitCode, 3);
  assert.match("output" in result ? result.output : "", /Usage/);
});
