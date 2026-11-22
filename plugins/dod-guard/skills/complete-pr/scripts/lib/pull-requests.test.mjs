// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { pull } from "./complete-pr.test-support.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import {
  markReady,
  mergePullRequest,
  normalizePullRequest,
  readPullRequest,
  readPullRequestRefs,
  updateBranch,
} from "./pull-requests.mjs";

const guardedPull = { repository: "owner/repo", pullNumber: 24, expectedHead: "head-1" };

function jsonResponse(value) {
  return okResponse(JSON.stringify(value));
}

// Builds a command runner that records every argument list and answers each through respond(args).
function recordingRunner(respond) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return respond(args);
  };
  return { calls, runner };
}

test("reads temporary pull-request refs with a delimited pull-number prefix", () => {
  const { calls, runner } = recordingRunner(() =>
    jsonResponse([
      { ref: "refs/pull/24/head", object: { sha: "head-1" } },
      { ref: "refs/pull/24/merge", object: { sha: "merge-1" } },
    ]),
  );

  assert.deepEqual(readPullRequestRefs("owner/repo", 24, runner), [
    { kind: "head", ref: "refs/pull/24/head", sha: "head-1" },
    { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-1" },
  ]);
  assert.deepEqual(calls, [["api", "repos/owner/repo/git/matching-refs/pull/24/"]]);
  assert.equal(
    calls.some((args) => args.includes("--method") || args.includes("PUT") || args.includes("POST")),
    false,
  );
});

test("treats an absent temporary pull-request ref set as empty", () => {
  const runner = () => ({
    status: 1,
    stderr: "HTTP 404: Not Found",
    stdout: "",
  });

  assert.deepEqual(readPullRequestRefs("owner/repo", 24, runner), []);
});

test("rejects malformed and duplicate temporary pull-request refs", () => {
  for (const response of [
    [{ ref: "refs/pull/24/head", object: {} }],
    [{ ref: "refs/pull/24/other", object: { sha: "head-1" } }],
    [
      { ref: "refs/pull/24/head", object: { sha: "head-1" } },
      { ref: "refs/pull/24/head", object: { sha: "head-1" } },
    ],
  ]) {
    const runner = () => jsonResponse(response);

    assert.throws(() => readPullRequestRefs("owner/repo", 24, runner), { code: "github_response_shape" });
  }
});

test("getPullRequest reads the pull endpoint and normalizes it", () => {
  const { calls, runner } = recordingRunner(() =>
    jsonResponse({
      number: 24,
      state: "open",
      draft: true,
      mergeable: null,
      mergeable_state: "blocked",
      html_url: "https://github.com/owner/repo/pull/24",
      head: { ref: "codex/24-x", sha: "head-1", repo: { full_name: "owner/repo" } },
      base: { ref: "master", sha: "base-1" },
    }),
  );

  const result = readPullRequest("owner/repo", 24, runner);

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/pulls/24"]);
  assert.equal(result.state, "OPEN");
  assert.equal(result.isDraft, true);
  assert.equal(result.mergeable, "UNKNOWN");
  assert.equal(result.mergeState, "BLOCKED");
  assert.equal(result.isCrossRepository, false);
  assert.equal(result.headSha, "head-1");
});

test("updateBranch puts the expected head sha", () => {
  const { calls, runner } = recordingRunner(() => okResponse(""));

  updateBranch(guardedPull, runner);

  assert.deepEqual(calls[0], [
    "api",
    "--method",
    "PUT",
    "repos/owner/repo/pulls/24/update-branch",
    "-f",
    "expected_head_sha=head-1",
  ]);
});

const mergeAmbiguousMessage =
  /Merge failed \(HTTP 502: Bad Gateway\); pull request readback failed \(HTTP 500: boom\)\./;

const headChangeMessage = /from head-1 to head-2/;

const isMergePut = (args) => args.includes("PUT") && args.some((arg) => arg.endsWith("/merge"));
const isPullRead = (args) => args.length === 2 && args[1] === "repos/owner/repo/pulls/24";

function mergeRunner(put, readback) {
  return recordingRunner((args) => {
    if (isMergePut(args)) {
      return put;
    }
    if (isPullRead(args) && readback) {
      return readback;
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  });
}

test("mergePullRequest throws merge_failed when the response does not report merged", () => {
  const { runner } = mergeRunner(jsonResponse({ merged: false, message: "Not mergeable" }));

  assert.throws(() => mergePullRequest(guardedPull, runner), {
    code: "merge_failed",
    message: "Not mergeable",
  });
});

test("mergePullRequest throws merge_ambiguous when the merge and the readback both fail", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    { status: 1, stderr: "HTTP 500: boom", stdout: "" },
  );

  assert.throws(() => mergePullRequest(guardedPull, runner), {
    code: "merge_ambiguous",
    message: mergeAmbiguousMessage,
  });
});

test("mergePullRequest throws unexpected_head_change when the merged readback shows another head", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    jsonResponse({
      number: 24,
      state: "closed",
      merged_at: "2026-10-01T00:00:00Z",
      head: { ref: "codex/24-x", sha: "head-2", repo: { full_name: "owner/repo" } },
      base: { ref: "master", sha: "base-1" },
    }),
  );

  assert.throws(() => mergePullRequest(guardedPull, runner), {
    code: "unexpected_head_change",
    message: headChangeMessage,
  });
});

test("normalizes the narrow REST pull request payload used by the completion loop", () => {
  assert.deepEqual(
    normalizePullRequest(
      {
        base: { ref: "master", sha: "base-1" },
        draft: true,
        head: { ref: "codex/24-complete-pr", sha: "head-1", repo: { full_name: "owner/repo" } },
        html_url: "https://github.com/owner/repo/pull/24",
        merge_commit_sha: null,
        mergeable: true,
        mergeable_state: "blocked",
        number: 24,
        state: "open",
      },
      "owner/repo",
    ),
    { ...pull(), url: "https://github.com/owner/repo/pull/24" },
  );
});

test("normalizes closed REST pull requests only when merged_at is populated", () => {
  assert.equal(
    normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state,
    "MERGED",
  );
  assert.equal(normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state, "CLOSED");
});

const nodeIdResponse = jsonResponse({ node_id: "PR_kw123" });

function readyResponse(isDraft) {
  const mutation = { pullRequest: { isDraft } };
  return jsonResponse({ data: { markPullRequestReadyForReview: mutation } });
}

function readyRunner(isDraft) {
  return recordingRunner((args) => (args.includes("graphql") ? readyResponse(isDraft) : nodeIdResponse));
}

test("marks a draft pull request ready through GraphQL and verifies draft state", () => {
  const { calls, runner } = readyRunner(false);

  markReady("owner/repo", 24, runner);

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/pulls/24"]);
  assert.equal(calls[1][0], "api");
  assert.equal(calls[1][1], "graphql");
  assert.match(calls[1][3], /markPullRequestReadyForReview/);
  assert.match(calls[1][3], /isDraft/);
  assert.deepEqual(calls[1].slice(-2), ["-F", "pullRequestId=PR_kw123"]);

  assert.throws(() => markReady("owner/repo", 24, readyRunner(true).runner), { code: "ready_transition_failed" });
});

test("surfaces failures from the GraphQL ready request", () => {
  const failure = new Error("GraphQL ready mutation failed");
  const { runner } = recordingRunner((args) => {
    if (args.includes("graphql")) {
      throw failure;
    }
    return nodeIdResponse;
  });

  assert.throws(() => markReady("owner/repo", 24, runner), failure);
});

test("merges a pull request through REST with the expected head SHA", () => {
  const merged = { merged: true, sha: "merge-1", message: "Pull Request successfully merged" };
  const { calls, runner } = recordingRunner(() => jsonResponse(merged));

  assert.deepEqual(mergePullRequest(guardedPull, runner), merged);
  assert.deepEqual(calls, [
    ["api", "--method", "PUT", "repos/owner/repo/pulls/24/merge", "-f", "sha=head-1", "-f", "merge_method=merge"],
  ]);
});

test("preserves a failed REST merge after an open pull-request readback", () => {
  const failure = new Error("HTTP 409: Pull Request is not mergeable");
  const openPull = jsonResponse({ state: "open", head: { sha: "head-1", repo: { full_name: "owner/repo" } } });
  const { calls, runner } = recordingRunner((args) => {
    if (isMergePut(args)) {
      throw failure;
    }
    return openPull;
  });

  assert.throws(() => mergePullRequest(guardedPull, runner), failure);
  assert.deepEqual(
    calls.map((args) => args.at(-1)),
    ["merge_method=merge", "repos/owner/repo/pulls/24"],
  );
});

test("accepts an ambiguous REST merge once the exact head reads back merged", () => {
  const mergedPull = jsonResponse({
    state: "closed",
    merged_at: "2026-09-28T01:00:00Z",
    head: { sha: "head-1", repo: { full_name: "owner/repo" } },
    merge_commit_sha: "merge-1",
  });
  const { calls, runner } = recordingRunner((args) => {
    if (isMergePut(args)) {
      throw new Error("connection reset");
    }
    return mergedPull;
  });

  assert.deepEqual(mergePullRequest(guardedPull, runner), { merged: true, sha: "merge-1" });
  assert.equal(calls.length, 2);
});
