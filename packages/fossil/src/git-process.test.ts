import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { discoverGitRepository, type GitSpawn } from "./git-process.js";

// covers: fossil/cli :: Safe Git execution :: Repository path is data, not a command
test("passes a metacharacter-containing repository path as one non-shell Git argument", () => {
  const calls: Array<{ command: string; arguments_: readonly string[]; options: object }> = [];
  const repositoryPath = "C:/repos/space & echo injected; $(whoami)";
  const runGit: GitSpawn = (command, arguments_, options) => {
    calls.push({ command, arguments_, options });
    return new EventEmitter() as never;
  };

  discoverGitRepository(repositoryPath, runGit);

  assert.deepEqual(calls, [
    {
      command: "git",
      arguments_: ["-C", repositoryPath, "rev-parse", "--show-toplevel"],
      options: { shell: false, windowsHide: true },
    },
  ]);
  assert.equal(calls[0].arguments_[1], repositoryPath);
  assert.equal(calls[0].arguments_.filter((argument) => argument === repositoryPath).length, 1);
});
