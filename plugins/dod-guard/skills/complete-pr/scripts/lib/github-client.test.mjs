// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { GitHubClient } from "./github-client.mjs";
import { okResponse } from "./github-client.test-support.mjs";

test("reads temporary pull-request refs with a delimited pull-number prefix", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify([
        { ref: "refs/pull/24/head", object: { sha: "head-1" } },
        { ref: "refs/pull/24/merge", object: { sha: "merge-1" } },
      ]),
    };
  });

  assert.deepEqual(client.getPullRequestRefs(), [
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
  const client = new GitHubClient("owner/repo", 24, () => ({
    status: 1,
    stderr: "HTTP 404: Not Found",
    stdout: "",
  }));

  assert.deepEqual(client.getPullRequestRefs(), []);
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
    const client = new GitHubClient("owner/repo", 24, () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    }));

    assert.throws(() => client.getPullRequestRefs(), { code: "github_response_shape" });
  }
});

test("rejects a malformed source branch ref", () => {
  const client = new GitHubClient("owner/repo", 24, () => ({
    status: 0,
    stderr: "",
    stdout: JSON.stringify({ object: {} }),
  }));

  assert.throws(() => client.getSourceBranchRef("codex/24-complete-pr"), {
    code: "github_response_shape",
  });
});

test("reads the live base branch tip from its branch ref and returns null when the ref is absent", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: JSON.stringify({ object: { sha: "base-2" } }) };
  });
  const absent = new GitHubClient("owner/repo", 24, () => ({ status: 1, stderr: "HTTP 404: Not Found", stdout: "" }));

  assert.deepEqual(client.getBaseBranchRef("master"), { sha: "base-2" });
  assert.deepEqual(calls, [["api", "repos/owner/repo/git/ref/heads/master"]]);
  assert.equal(absent.getBaseBranchRef("master"), null);
});

test("getRepository maps the repository settings", () => {
  const calls = [];
  let stdout = '{"allow_auto_merge":true,"permissions":{"push":true},"default_branch":"main","full_name":"owner/repo"}';
  const runner = (args) => {
    calls.push(args);
    return okResponse(stdout);
  };
  const client = new GitHubClient("owner/repo", 24, runner);

  assert.deepEqual(client.getRepository(), {
    autoMergeAllowed: true,
    canPush: true,
    defaultBranch: "main",
    nameWithOwner: "owner/repo",
  });
  assert.deepEqual(calls[0], ["api", "repos/owner/repo"]);

  stdout = '{"default_branch":"main","full_name":"owner/repo"}';
  assert.deepEqual(client.getRepository(), {
    autoMergeAllowed: false,
    canPush: false,
    defaultBranch: "main",
    nameWithOwner: "owner/repo",
  });
});

test("getPullRequest reads the pull endpoint and normalizes it", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse(
      '{"number":24,"state":"open","draft":true,"mergeable":null,"mergeable_state":"blocked","html_url":"https://github.com/owner/repo/pull/24","head":{"ref":"codex/24-x","sha":"head-1","repo":{"full_name":"owner/repo"}},"base":{"ref":"master","sha":"base-1"}}',
    );
  };

  const result = new GitHubClient("owner/repo", 24, runner).getPullRequest();

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/pulls/24"]);
  assert.equal(result.state, "OPEN");
  assert.equal(result.isDraft, true);
  assert.equal(result.mergeable, "UNKNOWN");
  assert.equal(result.mergeState, "BLOCKED");
  assert.equal(result.isCrossRepository, false);
  assert.equal(result.headSha, "head-1");
});

test("getCommit returns the sha and parent shas", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse(JSON.stringify({ sha: "c1", parents: [{ sha: "p1" }, { sha: "p2" }] }));
  };

  const result = new GitHubClient("owner/repo", 24, runner).getCommit("c1");

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/commits/c1"]);
  assert.deepEqual(result, { parents: ["p1", "p2"], sha: "c1" });
});

test("enableRepositoryAutoMerge patches allow_auto_merge", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "" };
  };

  new GitHubClient("owner/repo", 24, runner).enableRepositoryAutoMerge();

  assert.deepEqual(calls[0], ["api", "--method", "PATCH", "repos/owner/repo", "-F", "allow_auto_merge=true"]);
});

test("updateBranch puts the expected head sha", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse("");
  };

  new GitHubClient("owner/repo", 24, runner).updateBranch(24, "head-1");

  assert.deepEqual(calls[0], [
    "api",
    "--method",
    "PUT",
    "repos/owner/repo/pulls/24/update-branch",
    "-f",
    "expected_head_sha=head-1",
  ]);
});

test("deleteBranchRef encodes each branch segment", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse("");
  };

  new GitHubClient("owner/repo", 24, runner).deleteBranchRef("codex/24-a b");

  assert.deepEqual(calls[0], ["api", "--method", "DELETE", "repos/owner/repo/git/refs/heads/codex/24-a%20b"]);
});

test("wait resolves after the delay", async () => {
  assert.equal(await new GitHubClient("owner/repo", 24, () => okResponse("")).wait(0), undefined);
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

  assert.throws(() => new GitHubClient("owner/repo", 24, runner).mergePullRequest(24, "head-1"), {
    code: "merge_failed",
    message: "Not mergeable",
  });
});

test("mergePullRequest throws merge_ambiguous when the merge and the readback both fail", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    { status: 1, stderr: "HTTP 500: boom", stdout: "" },
  );

  assert.throws(() => new GitHubClient("owner/repo", 24, runner).mergePullRequest(24, "head-1"), {
    code: "merge_ambiguous",
    message: mergeAmbiguousMessage,
  });
});

test("mergePullRequest throws unexpected_head_change when the merged readback shows another head", () => {
  const { runner } = mergeRunner(
    { status: 1, stderr: "HTTP 502: Bad Gateway", stdout: "" },
    okResponse(
      '{"number":24,"state":"closed","merged_at":"2026-10-01T00:00:00Z","head":{"ref":"codex/24-x","sha":"head-2","repo":{"full_name":"owner/repo"}},"base":{"ref":"master","sha":"base-1"}}',
    ),
  );

  assert.throws(() => new GitHubClient("owner/repo", 24, runner).mergePullRequest(24, "head-1"), {
    code: "unexpected_head_change",
    message: headChangeMessage,
  });
});
