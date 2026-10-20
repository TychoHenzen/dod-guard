// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { GitHubClient } from "./github-client.mjs";
import { okResponse } from "./github-client.test-support.mjs";

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
