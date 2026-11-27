// Tests for record-ordinary: the one ordinary completion record after a merge, its rerun, and each
// refusal it adds to the record-legacy guard. The fake gh runner answers issue 61 and pull request 62.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS } from "./closure-commands.mjs";
import { HEAD, MERGE, REPO } from "./closure-legacy.fake-gh.mjs";
import { recordOrdinaryDelivery } from "./closure-legacy.mjs";
import { parseCompletionRecord, renderCompletionRecord } from "./closure-records.mjs";
import { ClosureStop } from "./closure-stop.mjs";
import { CRITERIA, checkedExcept, ordinaryFixture, pullBody } from "./ordinary.test-support.mjs";

const NOT_TARGET_REPOSITORY = () => {
  throw new Error("no read was expected");
};
const FIELDS = { pullRequest: 62, mergeCommit: MERGE, trustedHeadSha: HEAD, requiredChecks: "pass", pendingRows: [] };

function recordOf(fx) {
  return recordOrdinaryDelivery({ repository: REPO, pull: 62, issue: 61, runner: fx.runner });
}

function refusalOf(fx) {
  try {
    recordOf(fx);
  } catch (error) {
    return error;
  }
  throw new Error("record-ordinary wrote a record for a delivery it should refuse");
}

test("record-ordinary posts one ordinary completion record for a merged ordinary pull request", () => {
  const fx = ordinaryFixture({ merged: true });
  assert.deepEqual(recordOf(fx), { records: [{ issue: 61, action: "posted" }], ordinary: true });
  assert.deepEqual(parseCompletionRecord(fx.state.comments).record, { commentId: 100, ...FIELDS, ordinary: true });
});

test("record-ordinary rerun leaves its own record unchanged", () => {
  const fx = ordinaryFixture({ merged: true });
  recordOf(fx);
  assert.deepEqual(recordOf(fx), { records: [{ issue: 61, action: "unchanged" }], ordinary: true });
  assert.equal(fx.state.writes.length, 1);
});

const LEGACY_RECORD = renderCompletionRecord({ ...FIELDS, legacy: true });

const REFUSALS = [
  {
    name: "an unchecked criterion",
    change: (state) => Object.assign(state.pull, { body: pullBody({ items: checkedExcept(CRITERIA[1]) }) }),
    reason: `acceptance criterion unchecked in the pull request body: ${CRITERIA[1]}`,
  },
  {
    name: "a missing ordinary declaration",
    change: (state) => Object.assign(state.pull, { body: pullBody({ declaration: "- Handoff: none" }) }),
    reason: 'pull request #62 ## Convergence does not declare "- Handoff: none, ordinary path"',
  },
  {
    name: "sub-issues",
    change: (state) => {
      state.issue.sub_issues_summary = { total: 1, completed: 1 };
    },
    reason: "issue #61 has 1 sub-issues",
  },
  {
    name: "a step plan comment",
    change: (state) => state.comments.push({ id: 7, body: "## Step plan: T1\n\nx\n" }),
    reason: "issue #61 has a step plan comment",
  },
  {
    name: "a legacy completion record",
    change: (state) => state.comments.push({ id: 7, body: LEGACY_RECORD }),
    reason: "issue #61 already has a non-ordinary completion record",
  },
  {
    name: "an unmerged pull request",
    change: (state) => Object.assign(state.pull, { merged_at: null }),
    reason: "pull request #62 is not merged",
  },
];

for (const row of REFUSALS) {
  test(`record-ordinary refuses ${row.name} and writes nothing`, () => {
    const fx = ordinaryFixture({ merged: true });
    row.change(fx.state);
    const error = refusalOf(fx);
    assert.ok(error instanceof ClosureStop);
    assert.ok(error.message.startsWith("ordinary delivery refused: "), error.message);
    assert.ok(error.state.reasons.includes(row.reason), JSON.stringify(error.state.reasons));
    assert.deepEqual(fx.state.writes, []);
  });
}

test("record-ordinary rejects structured-path options before any read", () => {
  const base = { repository: REPO, pull: "62", issue: "61" };
  assert.equal(COMMANDS["record-ordinary"]({ ...base, "handoff-file": "x" }, NOT_TARGET_REPOSITORY), false);
  assert.equal(COMMANDS["record-ordinary"]({ ...base, result: "x" }, NOT_TARGET_REPOSITORY), false);
});
