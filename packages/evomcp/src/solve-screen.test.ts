import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import { screenCandidate } from "./solve-screen.js";
import type { TaskSpec } from "./types.js";

const spec: TaskSpec = {
  goal: "make the login test pass",
  verify_cmd: "npm test",
  cwd: "/repo",
};

/** A one-line addition to one file. No detector fires on it. */
function edit(file: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1,2 @@",
    " const x = 1;",
    "+const y = 2;",
    "",
  ].join("\n");
}

/** Three deleted assertions in a test file. That is a block-level finding. */
const GUTTED_TEST = [
  "diff --git a/src/a.test.ts b/src/a.test.ts",
  "--- a/src/a.test.ts",
  "+++ b/src/a.test.ts",
  "@@ -1,4 +1,1 @@",
  "-  assert.equal(a, 1);",
  "-  assert.equal(b, 2);",
  "-  assert.equal(c, 3);",
  " const x = 1;",
  "",
].join("\n");

function attempt(diff: string): AttemptResult {
  const state = blankResult({ index: 0, label: "simplest", prompt: "go" });
  state.diff = diff;
  state.passed = true;
  state.exitCode = 0;
  return state;
}

describe("screenCandidate", () => {
  // covers: evomcp/candidate-screening :: Screening runs the degenerate check before the allowed-files check :: Clean candidate touching a disallowed file
  it("accepts a plain edit inside the allow list", () => {
    const allowed = { ...spec, allowed_files: ["src/**"] };
    assert.equal(screenCandidate(attempt(edit("src/a.ts")), allowed), null);
  });

  it("accepts an empty change set, which is not degenerate", () => {
    assert.equal(screenCandidate(attempt(""), spec), null);
  });

  // covers: evomcp/candidate-screening :: Screening runs the degenerate check before the allowed-files check :: No allow list configured
  it("skips the allow-list filter when the caller set none", () => {
    assert.equal(screenCandidate(attempt(edit("docs/b.md")), spec), null);
  });

  it("skips the allow-list filter for an empty allow list", () => {
    const empty = { ...spec, allowed_files: [] };
    assert.equal(screenCandidate(attempt(edit("docs/b.md")), empty), null);
  });

  // covers: evomcp/candidate-screening :: Screening runs the degenerate check before the allowed-files check :: Clean candidate touching a disallowed file
  it("refuses a change that reaches outside the allow list", () => {
    const allowed = { ...spec, allowed_files: ["src/**"] };
    assert.equal(
      screenCandidate(attempt(edit("docs/b.md")), allowed),
      "strategy-0 rejected, outside allowed_files: docs/b.md",
    );
  });

  it("lists every file outside the allow list", () => {
    const allowed = { ...spec, allowed_files: ["src/**"] };
    const diff = edit("docs/b.md") + edit("bin/run.sh");
    assert.equal(
      screenCandidate(attempt(diff), allowed),
      "strategy-0 rejected, outside allowed_files: docs/b.md, bin/run.sh",
    );
  });

  // covers: evomcp/candidate-screening :: A candidate is rejected on any block finding or on multiple findings :: Two warn-only findings rejected
  it("refuses a change that guts the tests", () => {
    assert.equal(
      screenCandidate(attempt(GUTTED_TEST), spec),
      "strategy-0 rejected as degenerate: BLOCKED: 1 degenerate pattern(s): deleted_assertion",
    );
  });

  // covers: evomcp/candidate-screening :: Screening runs the degenerate check before the allowed-files check :: Degenerate candidate never reaches the allowed-files check
  it("names the degenerate reason first when both filters would refuse", () => {
    const allowed = { ...spec, allowed_files: ["nothing/**"] };
    const reason = screenCandidate(attempt(GUTTED_TEST), allowed);
    assert.equal(reason?.includes("degenerate"), true);
    assert.equal(reason?.includes("allowed_files"), false);
  });

  it("names the lineage that produced the change", () => {
    const state = attempt(GUTTED_TEST);
    state.diagnostic.lineage_id = "strategy-4";
    assert.equal(screenCandidate(state, spec)?.startsWith("strategy-4 "), true);
  });
});
