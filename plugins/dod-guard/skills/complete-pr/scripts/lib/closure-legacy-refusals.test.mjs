// Tests for the record-legacy refusal table: each row changes one field of an accepted delivery, and
// the command must stop with that row's reason before it writes anything.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { test } from "node:test";
import { ClosureStop } from "./closure-apply.mjs";
import { fixture, HEAD, MERGE, refusalOf } from "./closure-legacy.test-support.mjs";
import { renderCompletionRecord } from "./closure-records.mjs";

const CHECK_REASON = "required checks are incomplete or failed";
const MERGE_REASON = "pull request #62 merge commit or head is missing";
const KEYWORD_REASON = "pull request #62 body has no closing keyword for #61";
// Listed here, not imported, so a record name added to or dropped from the guard fails this table.
const STRUCTURED_RECORD_NAMES = [
  "requirements",
  "clarifications",
  "implementation-plan",
  "task-list",
  "lens-ownership",
  "acceptance-evidence",
  "planned-acceptance-matrix",
];

function set(target, key, value) {
  target[key] = value;
}

function structuredRow(name) {
  return {
    name: `a structured ${name} record`,
    change: (fx) => set(fx.state.issue, "body", `## Implementation notes\n\n### ${name}\n\n- [ ] x\n`),
    reason: `issue #61 holds structured record ${name}`,
  };
}

function completionComment(extra = {}) {
  return renderCompletionRecord({
    pullRequest: 62,
    mergeCommit: MERGE,
    trustedHeadSha: HEAD,
    requiredChecks: "pass",
    pendingRows: [],
    ...extra,
  });
}

const REFUSALS = [
  { name: "an open issue", change: (fx) => set(fx.state.issue, "state", "open"), reason: "issue #61 is not closed" },
  ...STRUCTURED_RECORD_NAMES.map(structuredRow),
  {
    name: "a handoff comment",
    change: (fx) => fx.state.comments.push({ id: 7, body: "## Implementation handoff\n\nx\n" }),
    reason: "issue #61 has an implementation handoff comment",
  },
  {
    name: "an unmerged pull request",
    change: (fx) => set(fx.state.pull, "merged_at", null),
    reason: "pull request #62 is not merged",
  },
  {
    name: "a base other than the default branch",
    change: (fx) => set(fx.state.pull.base, "ref", "develop"),
    reason: "pull request #62 base is not the default branch",
  },
  {
    name: "a head repository other than the target",
    change: (fx) => set(fx.state.pull.head.repo, "full_name", "other/r"),
    reason: "pull request #62 head repository is not the target repository",
  },
  {
    name: "a body that closes another issue",
    change: (fx) => set(fx.state.pull, "body", "Closes #6"),
    reason: KEYWORD_REASON,
  },
  {
    name: "a body that only mentions the issue",
    change: (fx) => set(fx.state.pull, "body", "see #61"),
    reason: KEYWORD_REASON,
  },
  {
    name: "a missing merge commit",
    change: (fx) => set(fx.state.pull, "merge_commit_sha", null),
    reason: MERGE_REASON,
  },
  { name: "a missing head sha", change: (fx) => set(fx.state.pull.head, "sha", ""), reason: MERGE_REASON },
  {
    name: "an incomplete required check",
    change: (fx) => set(fx.state, "checkConclusion", "failure"),
    reason: CHECK_REASON,
  },
  {
    name: "an existing completion record without the legacy flag",
    change: (fx) => fx.state.comments.push({ id: 7, body: completionComment() }),
    reason: "issue #61 already has a non-legacy completion record",
  },
];

for (const row of REFUSALS) {
  test(`record-legacy refuses ${row.name} and writes nothing`, () => {
    const fx = fixture();
    row.change(fx);
    const error = refusalOf(fx);
    assert.ok(error instanceof ClosureStop);
    assert.ok(error.message.startsWith("legacy delivery refused: "), error.message);
    assert.ok(error.message.includes(row.reason), error.message);
    assert.ok(error.state.reasons.includes(row.reason), JSON.stringify(error.state.reasons));
    assert.deepEqual(fx.state.writes, []);
  });
}
