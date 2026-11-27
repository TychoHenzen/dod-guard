// Tests for the ordinary-path evidence rules: which issues are structured, and what the pull request body
// must show before an ordinary ticket merges or records.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
import assert from "node:assert/strict";
import { test } from "node:test";
import { CRITERIA, issueBody, pullBody } from "./ordinary.test-support.mjs";
import { ordinaryEvidenceReasons, structuredMarkers } from "./ordinary-evidence.mjs";

const [FIRST, SECOND] = CRITERIA;

function live({ issue = {}, pull = {}, comments = [] } = {}) {
  return {
    issueNumber: 61,
    pullNumber: 62,
    issue: { body: issueBody(), sub_issues_summary: { total: 0 }, ...issue },
    pull: { body: pullBody(), ...pull },
    comments,
  };
}

test("a pull request that checks every issue criterion and declares the ordinary path has no gaps", () => {
  assert.deepEqual(ordinaryEvidenceReasons(live()), []);
});

test("the declaration may carry a note after it, and an extra checked item may stay", () => {
  const body = pullBody({
    items: [...CRITERIA.map((text) => [true, text]), [true, "Unit tests pass."]],
    declaration: "- Handoff: none, ordinary path (head abc)",
  });
  assert.deepEqual(ordinaryEvidenceReasons(live({ pull: { body } })), []);
});

test("criteria match once whitespace is collapsed, so a wrapped line still matches", () => {
  const issue = { body: issueBody([[false, "The proof passes\n  an ordinary pull request."]]) };
  const pull = { body: pullBody({ items: [[true, FIRST]] }) };
  assert.deepEqual(ordinaryEvidenceReasons(live({ issue, pull })), []);
});

test("an unchecked, missing or extra unchecked item is a gap", () => {
  const body = pullBody({
    items: [
      [false, FIRST],
      [false, "Docs updated."],
    ],
  });
  assert.deepEqual(ordinaryEvidenceReasons(live({ pull: { body } })), [
    `acceptance criterion unchecked in the pull request body: ${FIRST}`,
    `acceptance criterion missing from the pull request body: ${SECOND}`,
    "unchecked item in the pull request body: Docs updated.",
  ]);
});

test("an issue with no acceptance criteria checklist is refused, never passed as empty", () => {
  const issue = { body: "## Problem\n\nx\n\n## Acceptance\n\n- [ ] Only under the wrong heading.\n" };
  assert.deepEqual(ordinaryEvidenceReasons(live({ issue })), ["issue #61 has no ## Acceptance criteria checklist"]);
});

test("a missing declaration is a gap, and one inside a code block does not count", () => {
  const fenced = pullBody({ declaration: "```text\n- Handoff: none, ordinary path\n```" });
  for (const body of [pullBody({ declaration: "- Handoff: <link> (head abc)" }), fenced]) {
    assert.deepEqual(ordinaryEvidenceReasons(live({ pull: { body } })), [
      'pull request #62 ## Convergence does not declare "- Handoff: none, ordinary path"',
    ]);
  }
});

test("sub-issues, or a sub-issue count that cannot be read, are refused", () => {
  assert.deepEqual(ordinaryEvidenceReasons(live({ issue: { sub_issues_summary: { total: 2 } } })), [
    "issue #61 has 2 sub-issues",
  ]);
  assert.deepEqual(ordinaryEvidenceReasons(live({ issue: { sub_issues_summary: undefined } })), [
    "issue #61 sub-issue count is unreadable",
  ]);
});

test("a structured record, a handoff comment or a step plan comment marks the issue structured", () => {
  const issue = { body: `${issueBody()}\n## Implementation notes\n\n### requirements\n\n- x\n` };
  const comments = [
    { id: 1, body: "## Implementation handoff\n\nx" },
    { id: 2, body: "  ## Step plan: T1\n\nx" },
    { id: 3, body: "A note that quotes ## Implementation handoff mid-body." },
  ];
  assert.deepEqual(structuredMarkers(live({ issue, comments })), [
    "issue #61 holds structured record requirements",
    "issue #61 has an implementation handoff comment",
    "issue #61 has a step plan comment",
  ]);
  assert.deepEqual(structuredMarkers(live()), []);
});
