// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { okResponse } from "./github-client.test-support.mjs";
import {
  markReady,
  mergePullRequest,
  normalizePullRequest,
  readPullRequest,
  readPullRequestRefs,
  updateBranch,
} from "./pull-requests.mjs";

test("reads temporary pull-request refs with a delimited pull-number prefix", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify([
        { ref: "refs/pull/24/head", object: { sha: "head-1" } },
        { ref: "refs/pull/24/merge", object: { sha: "merge-1" } },
      ]),
    };
  };

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
    const runner = () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    });

    assert.throws(() => readPullRequestRefs("owner/repo", 24, runner), { code: "github_response_shape" });
  }
});

test("getPullRequest reads the pull endpoint and normalizes it", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse(
      JSON.stringify({
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
  };

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
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse("");
  };

  updateBranch("owner/repo", 24, "head-1", runner);

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

function mergeRunner(put, readback) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args.includes("PUT") && args.some((arg) => arg.endsWith("/merge"))) {
      return put;
    }
    if (args.length === 2 && args[0] === "api" && args[1] === "repos/owner/repo/pulls/24" && readback) {
      return readback;
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

test("mergePullRequest throws merge_failed when the response does not report merged", () => {
  const { runner } = mergeRunner(okResponse(JSON.stringify({ merged: false, message: "Not mergeable" })));

  assert.throws(() => mergePullRequest("owner/repo", 24, "head-1", runner), {
    code: "merge_failed",
    message: "Not mergeable",
  });
});

test("mergePullRequest throws merge_ambiguous when the merge and the readback both fail", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    { status: 1, stderr: "HTTP 500: boom", stdout: "" },
  );

  assert.throws(() => mergePullRequest("owner/repo", 24, "head-1", runner), {
    code: "merge_ambiguous",
    message: mergeAmbiguousMessage,
  });
});

test("mergePullRequest throws unexpected_head_change when the merged readback shows another head", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    okResponse(
      JSON.stringify({
        number: 24,
        state: "closed",
        merged_at: "2026-10-01T00:00:00Z",
        head: { ref: "codex/24-x", sha: "head-2", repo: { full_name: "owner/repo" } },
        base: { ref: "master", sha: "base-1" },
      }),
    ),
  );

  assert.throws(() => mergePullRequest("owner/repo", 24, "head-1", runner), {
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
    {
      baseBranch: "master",
      baseSha: "base-1",
      headBranch: "codex/24-complete-pr",
      headRepository: "owner/repo",
      headSha: "head-1",
      isCrossRepository: false,
      isDraft: true,
      mergeCommitSha: null,
      mergeState: "BLOCKED",
      mergeable: "MERGEABLE",
      number: 24,
      state: "OPEN",
      url: "https://github.com/owner/repo/pull/24",
    },
  );
});

test("normalizes closed REST pull requests only when merged_at is populated", () => {
  assert.equal(
    normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state,
    "MERGED",
  );
  assert.equal(normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state, "CLOSED");
});

test("marks a draft pull request ready through GraphQL and verifies draft state", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args.includes("graphql")) {
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } },
        }),
      };
    }
    return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: "PR_kw123" }) };
  };

  markReady("owner/repo", 24, runner);

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/pulls/24"]);
  assert.equal(calls[1][0], "api");
  assert.equal(calls[1][1], "graphql");
  assert.match(calls[1][3], /markPullRequestReadyForReview/);
  assert.match(calls[1][3], /isDraft/);
  assert.deepEqual(calls[1].slice(-2), ["-F", "pullRequestId=PR_kw123"]);

  const draftRunner = (args) => ({
    status: 0,
    stderr: "",
    stdout: args.includes("graphql")
      ? JSON.stringify({
          data: { markPullRequestReadyForReview: { pullRequest: { isDraft: true } } },
        })
      : JSON.stringify({ node_id: "PR_kw123" }),
  });
  assert.throws(() => markReady("owner/repo", 24, draftRunner), { code: "ready_transition_failed" });
});

test("surfaces failures from the GraphQL ready request", () => {
  const failure = new Error("GraphQL ready mutation failed");
  const runner = (args) => {
    if (args.includes("graphql")) {
      throw failure;
    }
    return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: "PR_kw123" }) };
  };

  assert.throws(() => markReady("owner/repo", 24, runner), failure);
});

test("merges a pull request through REST with the expected head SHA", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ merged: true, sha: "merge-1", message: "Pull Request successfully merged" }),
    };
  };

  assert.deepEqual(mergePullRequest("owner/repo", 24, "head-1", runner), {
    merged: true,
    sha: "merge-1",
    message: "Pull Request successfully merged",
  });
  assert.deepEqual(calls, [
    ["api", "--method", "PUT", "repos/owner/repo/pulls/24/merge", "-f", "sha=head-1", "-f", "merge_method=merge"],
  ]);
});

test("preserves a failed REST merge after an open pull-request readback", () => {
  const failure = new Error("HTTP 409: Pull Request is not mergeable");
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args.some((value) => String(value).endsWith("/merge"))) {
      throw failure;
    }
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ state: "open", head: { sha: "head-1", repo: { full_name: "owner/repo" } } }),
    };
  };

  assert.throws(() => mergePullRequest("owner/repo", 24, "head-1", runner), failure);
  assert.deepEqual(
    calls.map((args) => args.at(-1)),
    ["merge_method=merge", "repos/owner/repo/pulls/24"],
  );
});

test("accepts an ambiguous REST merge once the exact head reads back merged", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args.some((value) => String(value).endsWith("/merge"))) {
      throw new Error("connection reset");
    }
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        state: "closed",
        merged_at: "2026-09-28T01:00:00Z",
        head: { sha: "head-1", repo: { full_name: "owner/repo" } },
        merge_commit_sha: "merge-1",
      }),
    };
  };

  assert.deepEqual(mergePullRequest("owner/repo", 24, "head-1", runner), { merged: true, sha: "merge-1" });
  assert.equal(calls.length, 2);
});
