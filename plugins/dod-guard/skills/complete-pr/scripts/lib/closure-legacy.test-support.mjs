// Shared setup for the record-legacy tests: one delivery the guard accepts, and the check that a changed
// delivery is refused before any write.
// biome-ignore-all lint/correctness/noNodejsModules: node:assert is the test harness
// biome-ignore-all lint/suspicious/noMisplacedAssertion: the shared refusal check runs inside tests
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { HEAD, ISSUE, MERGE, PULL, REPO, runnerOf } from "./closure-legacy.fake-gh.mjs";
import { recordLegacyDelivery } from "./closure-legacy.mjs";
import { ClosureStop } from "./closure-stop.mjs";

function freshIssue() {
  return { number: ISSUE, state: "closed", state_reason: "completed", body: "## Idea\n\nx\n" };
}

function freshPull() {
  return {
    number: PULL,
    merged_at: "2026-10-30T10:00:00Z",
    merge_commit_sha: MERGE,
    base: { ref: "main" },
    head: { sha: HEAD, repo: { full_name: REPO } },
    body: "Closes #61",
  };
}

function freshState() {
  return {
    defaultBranch: "main",
    issue: freshIssue(),
    pull: freshPull(),
    comments: [],
    checkConclusion: "success",
    nextId: 100,
    writes: [],
    calls: [],
  };
}

// Issue 61 closed, pull 62 merged onto main by "Closes #61", and the one required check passing on the
// head. Each refusal test changes one field of it before the call.
function fixture() {
  const state = freshState();
  return { state, runner: runnerOf(state) };
}

function legacyOf(fx) {
  return recordLegacyDelivery({ repository: REPO, pull: PULL, issue: ISSUE, runner: fx.runner });
}

function refusalOf(fx) {
  try {
    legacyOf(fx);
  } catch (error) {
    return error;
  }
  throw new Error("record-legacy wrote a record for a delivery it should refuse");
}

// Changes one field of the accepted delivery and asserts the refusal names the row's reason and writes nothing.
function expectRefusal(row) {
  const fx = fixture();
  row.change(fx);
  const error = refusalOf(fx);
  assert.ok(error instanceof ClosureStop);
  assert.ok(error.message.startsWith("legacy delivery refused: "), error.message);
  assert.ok(error.message.includes(row.reason), error.message);
  assert.ok(error.state.reasons.includes(row.reason), JSON.stringify(error.state.reasons));
  assert.deepEqual(fx.state.writes, []);
}

export { expectRefusal, fixture, legacyOf };
