// Tests for the record-legacy refusals about the issue and its records: each row changes one field of an
// accepted delivery, and the command must stop with that row's reason before it writes anything.
// biome-ignore-all lint/correctness/noNodejsModules: node:test is the test harness
import { test } from "node:test";
import { HEAD, MERGE } from "./closure-legacy.fake-gh.mjs";
import { expectRefusal } from "./closure-legacy.test-support.mjs";
import { renderCompletionRecord } from "./closure-records.mjs";

// Spelled apart from the guard's own list, so a record name added to or dropped from the guard fails here.
const STRUCTURED_RECORD_NAMES = [
  "requirements clarifications implementation-plan",
  "task-list lens-ownership",
  "acceptance-evidence planned-acceptance-matrix",
].flatMap((group) => group.split(" "));

function setIssue(key, value) {
  return (fx) => {
    fx.state.issue[key] = value;
  };
}

function structuredRow(name) {
  return {
    name: `a structured ${name} record`,
    change: setIssue("body", `## Implementation notes\n\n### ${name}\n\n- [ ] x\n`),
    reason: `issue #61 holds structured record ${name}`,
  };
}

function comment(body) {
  return (fx) => {
    fx.state.comments.push({ id: 7, body });
  };
}

const NON_LEGACY_RECORD = renderCompletionRecord({
  pullRequest: 62,
  mergeCommit: MERGE,
  trustedHeadSha: HEAD,
  requiredChecks: "pass",
  pendingRows: [],
});

const REFUSALS = [
  { name: "an open issue", change: setIssue("state", "open"), reason: "issue #61 is not closed" },
  ...STRUCTURED_RECORD_NAMES.map(structuredRow),
  {
    name: "a handoff comment",
    change: comment("## Implementation handoff\n\nx\n"),
    reason: "issue #61 has an implementation handoff comment",
  },
  {
    name: "an incomplete required check",
    change: (fx) => {
      fx.state.checkConclusion = "failure";
    },
    reason: "required checks are incomplete or failed",
  },
  {
    name: "an existing completion record without the legacy flag",
    change: comment(NON_LEGACY_RECORD),
    reason: "issue #61 already has a non-legacy completion record",
  },
];

for (const row of REFUSALS) {
  test(`record-legacy refuses ${row.name} and writes nothing`, () => expectRefusal(row));
}
