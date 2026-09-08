import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { discoverGitRepository, type GitSpawn } from "./git-process.js";
import { repositoryDiscoveryArguments } from "./git-process.test-support.js";

test("passes a metacharacter-containing repository path as one non-shell Git argument", () => {
  const calls: Array<{ command: string; arguments_: readonly string[]; options: object }> = [];
  const repositoryPath = "C:/repos/space & echo injected; $(whoami)";
  const runGit: GitSpawn = (command, arguments_, options) => {
    calls.push({ command, arguments_, options });
    return new EventEmitter() as never;
  };

  discoverGitRepository(repositoryPath, runGit, {});

  assert.deepEqual(calls, [
    {
      command: "git",
      arguments_: repositoryDiscoveryArguments(repositoryPath),
      options: { shell: false, windowsHide: true, env: { GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" } },
    },
  ]);
  assert.equal(calls[0].arguments_[6], repositoryPath);
  assert.equal(calls[0].arguments_.filter((argument) => argument === repositoryPath).length, 1);
});
