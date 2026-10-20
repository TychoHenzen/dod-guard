// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { deleteBranchRef, encodeBranch, readBranchRef, readCommit } from "./git-refs.mjs";
import { okResponse } from "./github-client.test-support.mjs";

test("getCommit returns the sha and parent shas", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse(JSON.stringify({ sha: "c1", parents: [{ sha: "p1" }, { sha: "p2" }] }));
  };

  const result = readCommit("owner/repo", "c1", runner);

  assert.deepEqual(calls[0], ["api", "repos/owner/repo/commits/c1"]);
  assert.deepEqual(result, { parents: ["p1", "p2"], sha: "c1" });
});

test("deleteBranchRef encodes each branch segment", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse("");
  };

  deleteBranchRef("owner/repo", "codex/24-a b", runner);

  assert.deepEqual(calls[0], ["api", "--method", "DELETE", "repos/owner/repo/git/refs/heads/codex/24-a%20b"]);
});

test("encodeBranch encodes each segment and keeps the slashes", () => {
  assert.equal(encodeBranch("codex/24-a b#c"), "codex/24-a%20b%23c");
});

test("readBranchRef reads the encoded ref and returns its sha", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return okResponse(JSON.stringify({ object: { sha: "s1" } }));
  };

  const result = readBranchRef("owner/repo", "codex/24-a b", runner);

  assert.deepEqual(calls, [["api", "repos/owner/repo/git/ref/heads/codex/24-a%20b"]]);
  assert.deepEqual(result, { sha: "s1" });
});

test("readBranchRef returns null for an absent ref", () => {
  const runner = () => ({ status: 1, stderr: "HTTP 404: Not Found", stdout: "" });

  assert.equal(readBranchRef("owner/repo", "codex/24-x", runner), null);
});

test("readBranchRef throws the stderr of any other failed read", () => {
  const runner = () => ({ status: 1, stderr: "HTTP 403: Forbidden", stdout: "" });

  assert.throws(() => readBranchRef("owner/repo", "codex/24-x", runner), {
    message: "HTTP 403: Forbidden",
  });
});

test("readBranchRef rejects a ref without a commit sha and names the endpoint", () => {
  const runner = () => okResponse(JSON.stringify({ object: { sha: " " } }));

  assert.throws(() => readBranchRef("owner/repo", "codex/24-x", runner), {
    code: "github_response_shape",
    message:
      "GitHub response for repos/owner/repo/git/ref/heads/codex/24-x must include a branch ref with a commit SHA.",
  });
});
