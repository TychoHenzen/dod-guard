// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  normalizeGitHubHierarchy,
  normalizeGitHubReviewThreads,
  redactSecrets,
} from "./lib/fix-support.mjs";

const CHILD_ISSUE_NUMBER = 34;
const MISSING_GITHUB_FINDING = /GH-99/;
const CODEX_BOT = { login: "chatgpt-codex-connector[bot]" };

test("selects unresolved GitHub review findings with provider identifiers", () => {
  const payload = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      body: "Fix the branch check",
                      commit: { oid: "abc123" },
                      databaseId: 41,
                      url: "https://example.test/41",
                    },
                  ],
                },
                id: "PRRT_1",
                isOutdated: false,
                isResolved: false,
                line: 20,
                path: "src/review.js",
              },
            ],
          },
        },
      },
    },
  };

  assert.deepEqual(normalizeGitHubReviewThreads(payload, ["GH-41"]), [
    {
      body: "Fix the branch check",
      commentId: 41,
      commitSha: "abc123",
      file: "src/review.js",
      id: "GH-41",
      isOutdated: false,
      isResolved: false,
      line: 20,
      reviewState: "open",
      threadId: "PRRT_1",
      url: "https://example.test/41",
    },
  ]);
});

test("normalizes selected findings across paginated thread responses", () => {
  const payload = {
    pages: [
      {
        reviewThreads: {
          nodes: [
            {
              comments: [{ body: "Other", databaseId: 40 }],
              id: "PRRT_0",
              line: 10,
              path: "src/other.js",
            },
          ],
        },
      },
      {
        reviewThreads: {
          nodes: [
            {
              comments: [
                {
                  body: "Selected",
                  commit: { oid: "abc123" },
                  databaseId: 41,
                  url: "https://example.test/41",
                },
              ],
              id: "PRRT_1",
              line: 20,
              path: "src/review.js",
            },
          ],
        },
      },
    ],
  };

  assert.equal(
    normalizeGitHubReviewThreads(payload, ["GH-41"])[0].threadId,
    "PRRT_1",
  );
});

test("rejects a selected GitHub finding that is absent", () => {
  assert.throws(
    () => normalizeGitHubReviewThreads({ reviewThreads: [] }, ["GH-99"]),
    MISSING_GITHUB_FINDING,
  );
});

test("rejects an ambiguous selected GitHub finding", () => {
  const payload = {
    reviewThreads: [
      {
        comments: [{ databaseId: 41 }],
        id: "PRRT_1",
        line: 20,
        path: "src/review.js",
      },
      {
        comments: [{ databaseId: 41 }],
        id: "PRRT_2",
        line: 21,
        path: "src/review.js",
      },
    ],
  };

  assert.throws(
    () => normalizeGitHubReviewThreads(payload, ["GH-41"]),
    /Ambiguous GitHub finding: GH-41/,
  );
});

test("keeps outdated findings open for revalidation and marks only resolved threads stale", () => {
  const payload = {
    reviewThreads: [
      {
        comments: [{ body: "Old claim", databaseId: 42 }],
        id: "PRRT_2",
        isOutdated: true,
        isResolved: false,
        line: null,
        originalLine: 29,
        path: "src/old.js",
      },
      {
        comments: [{ body: "Done", databaseId: 43 }],
        id: "PRRT_3",
        isOutdated: false,
        isResolved: true,
        line: 5,
        path: "src/done.js",
      },
    ],
  };

  const [outdated, resolved] = normalizeGitHubReviewThreads(payload, [
    "GH-42",
    "GH-43",
  ]);
  assert.deepEqual(
    [outdated.reviewState, outdated.line, outdated.isOutdated],
    ["open", 29, true],
  );
  assert.equal(resolved.reviewState, "stale");
});

test("normalizes REST review comments from slurped pages and skips replies", () => {
  // Shapes from TychoHenzen/dod-guard#819: a Codex finding whose anchor moved,
  // and the author's reply.
  const pages = [
    [
      {
        body: "**P2** Align guidance",
        commit_id: "c10d2a15",
        html_url:
          "https://github.com/TychoHenzen/dod-guard/pull/819#discussion_r4181308695",
        id: 4_181_308_695,
        line: null,
        original_line: 29,
        path: "rules.md",
        pull_request_review_id: 5_410_751_145,
        user: CODEX_BOT,
      },
      {
        body: "Fixed in commit 8fd68f4.",
        id: 4_181_346_745,
        in_reply_to_id: 4_181_308_695,
        line: null,
        path: "rules.md",
        pull_request_review_id: 1,
      },
    ],
  ];

  assert.deepEqual(normalizeGitHubReviewThreads(pages), [
    {
      body: "**P2** Align guidance",
      commentId: 4_181_308_695,
      commitSha: "c10d2a15",
      file: "rules.md",
      id: "GH-4181308695",
      isOutdated: true,
      isResolved: null,
      line: 29,
      reviewState: "open",
      threadId: null,
      url: "https://github.com/TychoHenzen/dod-guard/pull/819#discussion_r4181308695",
    },
  ]);
});

test("normalizes the parent PBI and linked sub-issues", () => {
  const result = normalizeGitHubHierarchy({
    body: "## Outcome\nWorks.\n\n## Acceptance criteria\n- [ ] Visible result\n",
    number: 33,
    state: "OPEN",
    subIssues: {
      nodes: [
        { body: "Details", number: 34, state: "OPEN", title: "Fix findings" },
      ],
    },
    title: "Review pull requests",
  });
  assert.equal(result.acceptanceCriteria, "- [ ] Visible result");
  assert.equal(result.workItems[0].number, CHILD_ISSUE_NUMBER);
});

test("redacts credentials from nested finding context", () => {
  const token = ["ghp", "aaaaaaaaaaaaaaaaaaaa"].join("_");
  const redacted = redactSecrets({
    body: `Authorization: Bearer ${token}`,
    nested: ["?access_token=value"],
  });
  assert.equal(JSON.stringify(redacted).includes("aaaaaaaa"), false);
  assert.equal(JSON.stringify(redacted).includes("access_token=value"), false);
});
