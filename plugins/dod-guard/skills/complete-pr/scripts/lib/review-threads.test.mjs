// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { okResponse } from "./github-client.test-support.mjs";
import { readUnresolvedReviewThreads } from "./review-threads.mjs";

function threadRunner(responses) {
  const calls = [];
  const queue = [...responses];
  const runner = (args) => {
    calls.push(args);
    if (queue.length === 0) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { calls, runner };
}

function threadPageStdout(nodes, { endCursor = null, hasNextPage = false } = {}) {
  const reviewThreads = { nodes, pageInfo: { endCursor, hasNextPage } };
  return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads } } } });
}

function rawThreadPage(reviewThreads) {
  return okResponse(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads } } } }));
}

function threadNode({ id, isResolved, isOutdated, path, url, login }) {
  return {
    id,
    isResolved,
    isOutdated,
    path,
    comments: { nodes: [{ url, author: { login } }] },
  };
}

function discussionUrl(label) {
  return `https://github.com/owner/repo/pull/24#discussion_${label}`;
}

test("returns every unresolved review thread regardless of author or outdated state", () => {
  const { calls, runner } = threadRunner([
    okResponse(
      threadPageStdout([
        threadNode({
          id: "t1",
          isResolved: false,
          isOutdated: false,
          path: "src/a.mjs",
          url: discussionUrl("bot-open"),
          login: "chatgpt-codex-connector[bot]",
        }),
        threadNode({
          id: "t2",
          isResolved: true,
          isOutdated: false,
          path: "src/b.mjs",
          url: discussionUrl("bot-resolved"),
          login: "chatgpt-codex-connector[bot]",
        }),
        threadNode({
          id: "t3",
          isResolved: false,
          isOutdated: true,
          path: "src/c.mjs",
          url: discussionUrl("human-open"),
          login: "human-reviewer",
        }),
        threadNode({
          id: "t4",
          isResolved: true,
          isOutdated: true,
          path: "src/d.mjs",
          url: discussionUrl("human-resolved"),
          login: "human-reviewer",
        }),
        threadNode({
          id: "t5",
          isResolved: false,
          isOutdated: false,
          path: "src/e.mjs",
          url: discussionUrl("author-open"),
          login: "pr-author",
        }),
        threadNode({
          id: "t6",
          isResolved: true,
          isOutdated: false,
          path: "src/f.mjs",
          url: discussionUrl("author-resolved"),
          login: "pr-author",
        }),
      ]),
    ),
  ]);

  const threads = readUnresolvedReviewThreads("owner/repo", 24, runner);

  assert.deepEqual(threads, [
    {
      author: "chatgpt-codex-connector[bot]",
      id: "t1",
      outdated: false,
      path: "src/a.mjs",
      url: discussionUrl("bot-open"),
    },
    { author: "human-reviewer", id: "t3", outdated: true, path: "src/c.mjs", url: discussionUrl("human-open") },
    { author: "pr-author", id: "t5", outdated: false, path: "src/e.mjs", url: discussionUrl("author-open") },
  ]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("graphql"));
  const numberIndex = calls[0].indexOf("number=24");
  assert.ok(numberIndex > 0 && calls[0][numberIndex - 1] === "-F");
  assert.equal(
    calls[0].some((value) => value.startsWith("cursor=")),
    false,
  );
});

test("reads a two-page thread list in full", () => {
  const { calls, runner } = threadRunner([
    okResponse(
      threadPageStdout(
        [
          threadNode({
            id: "t1",
            isResolved: false,
            isOutdated: false,
            path: "src/a.mjs",
            url: discussionUrl("page-one"),
            login: "reviewer",
          }),
        ],
        { endCursor: "c1", hasNextPage: true },
      ),
    ),
    okResponse(
      threadPageStdout(
        [
          threadNode({
            id: "t2",
            isResolved: false,
            isOutdated: false,
            path: "src/b.mjs",
            url: discussionUrl("page-two"),
            login: "reviewer",
          }),
        ],
        { endCursor: "c2", hasNextPage: false },
      ),
    ),
  ]);

  const threads = readUnresolvedReviewThreads("owner/repo", 24, runner);

  assert.deepEqual(
    threads.map((thread) => thread.id),
    ["t1", "t2"],
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].some((value) => value.startsWith("cursor=")),
    false,
  );
  const cursorIndex = calls[1].indexOf("cursor=c1");
  assert.ok(cursorIndex > 0 && calls[1][cursorIndex - 1] === "-f");
});

const noReviewThreadsObject = /no reviewThreads object/;

const pageInfoNotBoolean = /hasNextPage is not a boolean/;

const nodeWithoutBooleanIsResolved = /without a boolean isResolved/;

test("fails closed with review-threads-unavailable on every unreadable thread page", () => {
  const cases = [
    ["a non-zero gh exit", [{ stderr: "HTTP 502: Bad Gateway", status: 1, stdout: "" }]],
    ["a thrown runner error", [new Error("spawn gh ENOENT")]],
    ["invalid JSON", [okResponse("not json")]],
    ["a top-level errors array", [okResponse(JSON.stringify({ errors: [{ message: "Something failed" }] }))]],
    ["a null pull request", [okResponse(JSON.stringify({ data: { repository: { pullRequest: null } } }))]],
    ["hasNextPage without an endCursor", [okResponse(threadPageStdout([], { endCursor: null, hasNextPage: true }))]],
    [
      "a stuck endCursor",
      [
        okResponse(threadPageStdout([], { endCursor: "c1", hasNextPage: true })),
        okResponse(threadPageStdout([], { endCursor: "c1", hasNextPage: true })),
      ],
    ],
    [
      "a pull request without reviewThreads",
      [okResponse(JSON.stringify({ data: { repository: { pullRequest: {} } } }))],
      noReviewThreadsObject,
    ],
    ["reviewThreads without pageInfo", [rawThreadPage({ nodes: [] })], noReviewThreadsObject],
    [
      "nodes that are not an array",
      [rawThreadPage({ nodes: null, pageInfo: { endCursor: null, hasNextPage: false } })],
      noReviewThreadsObject,
    ],
    ["a missing hasNextPage", [rawThreadPage({ nodes: [], pageInfo: { endCursor: null } })], pageInfoNotBoolean],
    [
      "a string hasNextPage",
      [rawThreadPage({ nodes: [], pageInfo: { endCursor: null, hasNextPage: "false" } })],
      pageInfoNotBoolean,
    ],
    [
      "a non-object node",
      [rawThreadPage({ nodes: [null], pageInfo: { endCursor: null, hasNextPage: false } })],
      nodeWithoutBooleanIsResolved,
    ],
    [
      "a node without isResolved",
      [
        rawThreadPage({
          nodes: [{ id: "t1", path: "src/a.mjs", comments: { nodes: [{ url: discussionUrl("no-state") }] } }],
          pageInfo: { endCursor: null, hasNextPage: false },
        }),
      ],
      nodeWithoutBooleanIsResolved,
    ],
  ];
  for (const [name, responses, messagePattern] of cases) {
    const { runner } = threadRunner(responses);
    let thrown = null;
    assert.throws(
      () => readUnresolvedReviewThreads("owner/repo", 24, runner),
      (error) => {
        thrown = error;
        return error.code === "review-threads-unavailable";
      },
      name,
    );
    if (messagePattern) {
      assert.match(thrown.message, messagePattern, name);
    }
  }
});

test("keeps the thrown read failure as the cause of review-threads-unavailable", () => {
  const runnerError = new Error("spawn gh ENOENT");
  const { runner } = threadRunner([runnerError]);

  assert.throws(
    () => readUnresolvedReviewThreads("owner/repo", 24, runner),
    (error) => error.code === "review-threads-unavailable" && error.cause === runnerError,
  );
});

test("fails closed when a thread cursor repeats on a later page", () => {
  const responses = [
    okResponse(threadPageStdout([], { endCursor: "c1", hasNextPage: true })),
    okResponse(threadPageStdout([], { endCursor: "c2", hasNextPage: true })),
    okResponse(threadPageStdout([], { endCursor: "c1", hasNextPage: true })),
  ];
  const { calls, runner } = threadRunner(responses);

  assert.throws(() => readUnresolvedReviewThreads("owner/repo", 24, runner), {
    code: "review-threads-unavailable",
  });
  assert.equal(calls.length, responses.length);
});
