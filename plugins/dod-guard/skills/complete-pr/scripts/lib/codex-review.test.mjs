import assert from "node:assert/strict";
import test from "node:test";
import { codexReviewGate } from "./codex-review.mjs";

// Mirrors the gate's own acknowledge window and Codex's GitHub login.
const CODEX_ACKNOWLEDGE_MS = 600_000;
const CODEX_BOT = "chatgpt-codex-connector[bot]";

const HEAD = "abc1234def5678abc1234def5678abc1234def56";
const CODEX = { login: CODEX_BOT };
const PERSON = { login: "TychoHenzen" };

function codexSummary(
  status,
  { commit = HEAD.slice(0, 7), at = "2026-10-08T08:00:00Z" } = {},
) {
  return {
    user: CODEX,
    body: [
      "<!-- codex-pull-request-review-summary -->",
      "| Task | Status | Commit | Trigger |",
      [
        "| **Code Review**",
        `**${status}** <relative-time datetime="${at}"></relative-time>`,
        `\`${commit}\``,
        "@codex review |",
      ].join(" | "),
    ].join("\n"),
  };
}

function codexFinding(id, { reviewId = 1, replyFrom } = {}) {
  const comments = [
    {
      id,
      user: CODEX,
      pull_request_review_id: reviewId,
      path: "src/a.mjs",
      line: 3,
      body: [
        "**<sub><sub>![P1 Badge](https://img)</sub></sub>",
        " Guard the empty list**\n\nDetails.",
      ].join(" "),
      html_url: `https://github.com/o/r/pull/24#discussion_r${id}`,
    },
  ];
  if (replyFrom)
    comments.push({
      id: id + 1,
      user: replyFrom,
      in_reply_to_id: id,
      body: "Fixed in abc.",
    });
  return comments;
}

const codexReviewOf = (commit = HEAD) => ({
  id: 1,
  user: CODEX,
  commit_id: commit,
});

test("passes when Codex never took part in the pull request", () => {
  assert.deepEqual(codexReviewGate({ acceptedHead: HEAD }), {
    action: "pass",
    reason: "codex-review-not-used",
  });
});

test("passes a clean review of the accepted head", () => {
  const result = codexReviewGate({
    acceptedHead: HEAD,
    issueComments: [codexSummary("Completed")],
    reviews: [codexReviewOf()],
    reviewComments: codexFinding(10, { replyFrom: PERSON }),
  });
  assert.deepEqual(result, { action: "pass", reason: "codex-review-clean" });
});

test("stops on an unanswered finding on the accepted head", () => {
  const result = codexReviewGate({
    acceptedHead: HEAD,
    issueComments: [codexSummary("Completed")],
    reviews: [codexReviewOf()],
    reviewComments: codexFinding(10),
  });
  assert.equal(result.action, "stop");
  assert.equal(result.reason, "codex-review-findings");
  assert.deepEqual(
    result.findings.map(({ id, severity, title }) => [id, severity, title]),
    [["GH-10", "P1", "Guard the empty list"]],
  );
});

test("waits for Codex, including the run the ready transition starts", () => {
  const running = codexReviewGate({
    acceptedHead: HEAD,
    issueComments: [codexSummary("Pending")],
    waitedMs: CODEX_ACKNOWLEDGE_MS * 2,
  });
  assert.equal(running.action, "wait");

  const beforeReady = {
    acceptedHead: HEAD,
    issueComments: [codexSummary("Completed", { at: "2026-10-08T08:00:00Z" })],
    readyAt: Date.parse("2026-10-08T09:00:00Z"),
  };
  assert.equal(codexReviewGate(beforeReady).action, "wait");
  assert.equal(
    codexReviewGate({
      ...beforeReady,
      reactions: [{ user: CODEX, content: "eyes" }],
      waitedMs: CODEX_ACKNOWLEDGE_MS,
    }).action,
    "wait",
  );
  // Codex never started a new run, so the draft's review cannot stand in.
  assert.equal(
    codexReviewGate({ ...beforeReady, waitedMs: CODEX_ACKNOWLEDGE_MS }).reason,
    "codex-review-missing-for-head",
  );
});

test("stops when Codex fails, or never reviews the accepted head", () => {
  assert.equal(
    codexReviewGate({
      acceptedHead: HEAD,
      issueComments: [codexSummary("Failed")],
    }).reason,
    "codex-review-failed",
  );
  const stale = {
    acceptedHead: HEAD,
    issueComments: [codexSummary("Completed", { commit: "0000000" })],
  };
  assert.equal(codexReviewGate(stale).action, "wait");
  assert.equal(
    codexReviewGate({ ...stale, waitedMs: CODEX_ACKNOWLEDGE_MS }).reason,
    "codex-review-missing-for-head",
  );
  const unanswered = {
    acceptedHead: HEAD,
    issueComments: [{ user: PERSON, body: "@codex review" }],
    waitedMs: CODEX_ACKNOWLEDGE_MS,
  };
  assert.equal(
    codexReviewGate(unanswered).reason,
    "codex-review-missing-for-head",
  );
  const unknown = {
    acceptedHead: HEAD,
    issueComments: [
      {
        user: CODEX,
        body: [
          "<!-- codex-pull-request-review-summary -->",
          "**Code Review** in a new layout",
        ].join("\n"),
      },
    ],
  };
  assert.equal(codexReviewGate(unknown).reason, "codex-summary-unrecognized");
});

test("treats a summary with only a Security Review row as no review", () => {
  const securityOnly = {
    user: CODEX,
    body: [
      "<!-- codex-pull-request-review-summary -->",
      "| Review | Status | Commit | Review trigger |",
      "| **Security Review** | **Running** | `abc1234` | Draft marked ready |",
    ].join("\n"),
  };
  const input = { acceptedHead: HEAD, issueComments: [securityOnly] };
  assert.equal(codexReviewGate(input).action, "wait");
  assert.equal(
    codexReviewGate({ ...input, waitedMs: CODEX_ACKNOWLEDGE_MS }).reason,
    "codex-review-missing-for-head",
  );
});
