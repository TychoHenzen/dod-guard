// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CODEX_BOT, TRIGGER_ACKNOWLEDGE_MS, codexReviewState } from "./codex-review-state.mjs";
import { REVIEW_WAIT_MS } from "./review-trigger.mjs";

// Shapes copied from TychoHenzen/dod-guard#819 at its first reviewed commit 588ec1bd.
const HEAD = "588ec1bdfd0000000000000000000000000000aa";
const bot = { login: CODEX_BOT };

function summary(statusCell, commit) {
  return {
    user: bot,
    created_at: "2026-10-05T06:30:00Z",
    body: [
      "<!-- codex-pull-request-review-summary -->",
      "## Codex Review Summary",
      "| Review | Status | Commit | Review trigger |",
      "| --- | --- | --- | --- |",
      `| 📝 **Code Review** | ${statusCell} <relative-time datetime="2026-10-05T06:36:44Z">x</relative-time> | \`${commit}\` | Comment |`,
    ].join("\n"),
  };
}

function badge(severity, title) {
  return `**<sub><sub>![${severity} Badge](https://img.shields.io/badge/${severity}-yellow?style=flat)</sub></sub>  ${title}**\n\nDetail.`;
}

const review = { id: 5_410_751_145, user: bot, commit_id: HEAD, state: "COMMENTED" };
const findings = [
  { id: 4_181_308_695, user: bot, path: "rules.md", line: null, original_line: 29, pull_request_review_id: review.id, body: badge("P2", "Align dynamic-reference guidance with unused-local behavior") },
  { id: 4_181_308_701, user: bot, path: "rules.md", line: 17, original_line: 17, pull_request_review_id: review.id, body: badge("P2", "Make the source contracts resolvable") },
  { id: 4_181_346_745, user: { login: "TychoHenzen" }, path: "rules.md", line: null, pull_request_review_id: 1, in_reply_to_id: 4_181_308_695, body: "Fixed." },
];
const pullRequest = { number: 819, draft: false, head: { sha: HEAD } };

test("reports Codex findings at the reviewed commit as REQUEST_CHANGES", () => {
  const state = codexReviewState({
    pullRequest,
    issueComments: [summary("✅ **Completed**", "588ec1b")],
    reviews: [review],
    reviewComments: findings,
  });
  assert.equal(state.action, "report");
  assert.equal(state.reviewedCurrentHead, true);
  assert.equal(state.recommendation, "REQUEST_CHANGES");
  assert.deepEqual(
    state.findings.map((item) => [item.id, item.severity, item.title, item.line, item.outdated]),
    [
      ["GH-4181308695", "P2", "Align dynamic-reference guidance with unused-local behavior", 29, true],
      ["GH-4181308701", "P2", "Make the source contracts resolvable", 17, false],
    ],
  );
});

test("a P0 finding blocks, and a completed review with no findings approves", () => {
  const blocking = codexReviewState({
    pullRequest,
    issueComments: [summary("✅ **Completed**", "588ec1b")],
    reviews: [review],
    reviewComments: [{ ...findings[1], body: badge("P0", "Data loss") }],
  });
  assert.equal(blocking.recommendation, "BLOCK");

  const clean = codexReviewState({
    pullRequest: { ...pullRequest, head: { sha: "c10d2a15af" } },
    issueComments: [summary("✅ **Completed**", "c10d2a1")],
    reviews: [review],
    reviewComments: findings,
  });
  assert.deepEqual([clean.recommendation, clean.findings, clean.reviewedCurrentHead], ["APPROVE", [], true]);
});

test("a completed review of an older head still reports and never re-triggers", () => {
  const state = codexReviewState({
    pullRequest: { ...pullRequest, head: { sha: "f011040" } },
    issueComments: [summary("✅ **Completed**", "588ec1b")],
    reviews: [review],
    reviewComments: findings,
  });
  assert.deepEqual([state.action, state.reviewedCurrentHead, state.findings.length], ["report", false, 2]);
});

test("a draft with no review triggers at once; a ready PR waits for the automatic review", () => {
  const draft = codexReviewState({ pullRequest: { ...pullRequest, draft: true } });
  assert.deepEqual([draft.action, draft.command], ["trigger", "@codex review"]);

  assert.equal(codexReviewState({ pullRequest, waitedMs: 0 }).action, "wait");
  assert.equal(codexReviewState({ pullRequest, waitedMs: REVIEW_WAIT_MS }).action, "trigger");
});

test("a running review waits, and a sent trigger is never repeated", () => {
  const running = codexReviewState({ pullRequest, reactions: [{ user: bot, content: "eyes" }], waitedMs: REVIEW_WAIT_MS });
  assert.deepEqual([running.action, running.reason], ["wait", "automatic-review-started"]);

  const now = Date.parse("2026-10-05T06:31:00Z");
  const triggered = codexReviewState({
    pullRequest,
    issueComments: [{ user: { login: "TychoHenzen" }, body: "@codex review", created_at: "2026-10-05T06:30:00Z" }],
    waitedMs: REVIEW_WAIT_MS,
    now,
  });
  assert.deepEqual([triggered.action, triggered.reason], ["wait", "review-trigger-already-sent"]);

  const ignored = codexReviewState({
    pullRequest,
    issueComments: [{ user: { login: "TychoHenzen" }, body: "@codex review", created_at: "2026-10-05T06:30:00Z", html_url: "u" }],
    now: Date.parse("2026-10-05T06:30:00Z") + TRIGGER_ACKNOWLEDGE_MS,
  });
  assert.deepEqual([ignored.action, ignored.reason], ["hold", "review-trigger-not-acknowledged"]);
});

test("a failed review gets one trigger, and an unknown summary shape holds", () => {
  const failed = codexReviewState({ pullRequest, issueComments: [summary("⚠️ **Failed**", "588ec1b")] });
  assert.equal(failed.action, "trigger");

  // The summary row failed at 06:36:44Z, after the 06:30:00Z trigger that started it.
  const failedAfterTrigger = codexReviewState({
    pullRequest: { ...pullRequest, draft: true },
    issueComments: [
      { user: { login: "TychoHenzen" }, body: "@codex review", created_at: "2026-10-05T06:30:00Z", html_url: "u" },
      summary("⚠️ **Failed**", "588ec1b"),
    ],
    now: Date.parse("2026-10-05T06:37:00Z"),
  });
  assert.deepEqual([failedAfterTrigger.action, failedAfterTrigger.reason], ["hold", "code-review-failed"]);

  const unknown = codexReviewState({
    pullRequest,
    issueComments: [{ user: bot, body: "<!-- codex-pull-request-review-summary -->\nnew layout" }],
  });
  assert.deepEqual([unknown.action, unknown.reason], ["hold", "summary-shape-unrecognized"]);
});
