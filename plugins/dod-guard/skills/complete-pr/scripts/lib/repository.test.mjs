// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { okResponse } from "./github-client.test-support.mjs";
import { enableRepositoryAutoMerge, readRepository } from "./repository.mjs";

test("getRepository maps the repository settings", () => {
  const calls = [];
  let stdout = '{"allow_auto_merge":true,"permissions":{"push":true},"default_branch":"main","full_name":"owner/repo"}';
  const runner = (args) => {
    calls.push(args);
    return okResponse(stdout);
  };

  assert.deepEqual(readRepository("owner/repo", runner), {
    autoMergeAllowed: true,
    canPush: true,
    defaultBranch: "main",
    nameWithOwner: "owner/repo",
  });
  assert.deepEqual(calls[0], ["api", "repos/owner/repo"]);

  stdout = '{"default_branch":"main","full_name":"owner/repo"}';
  assert.deepEqual(readRepository("owner/repo", runner), {
    autoMergeAllowed: false,
    canPush: false,
    defaultBranch: "main",
    nameWithOwner: "owner/repo",
  });
});

test("enableRepositoryAutoMerge patches allow_auto_merge", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "" };
  };

  enableRepositoryAutoMerge("owner/repo", runner);

  assert.deepEqual(calls[0], ["api", "--method", "PATCH", "repos/owner/repo", "-F", "allow_auto_merge=true"]);
});
