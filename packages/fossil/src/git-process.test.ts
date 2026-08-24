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

  discoverGitRepository(repositoryPath, runGit, {});

  assert.deepEqual(calls, [
    {
      command: "git",
      arguments_: ["--no-pager", "-C", repositoryPath, "rev-parse", "--show-toplevel"],
      options: { shell: false, windowsHide: true, env: { GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" } },
    },
  ]);
  assert.equal(calls[0].arguments_[2], repositoryPath);
  assert.equal(calls[0].arguments_.filter((argument) => argument === repositoryPath).length, 1);
});

// covers: fossil/cli :: Safe Git execution :: Git cannot open an interactive process
test("overrides hostile pager and prompt settings while preserving unrelated environment values", () => {
  const calls: Array<{ arguments_: readonly string[]; options: { readonly env: NodeJS.ProcessEnv } }> = [];
  const environment = {
    PATH: "C:/Git/bin",
    FOSSIL_TEST_VALUE: "preserved",
    GIT_PAGER: "hostile-pager",
    GIT_TERMINAL_PROMPT: "1",
  };
  const runGit: GitSpawn = (_command, arguments_, options) => {
    calls.push({ arguments_, options });
    return new EventEmitter() as never;
  };

  discoverGitRepository("C:/repositories/example", runGit, environment);

  assert.deepEqual(calls, [
    {
      arguments_: ["--no-pager", "-C", "C:/repositories/example", "rev-parse", "--show-toplevel"],
      options: {
        shell: false,
        windowsHide: true,
        env: {
          PATH: "C:/Git/bin",
          FOSSIL_TEST_VALUE: "preserved",
          GIT_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
    },
  ]);
  assert.deepEqual(environment, {
    PATH: "C:/Git/bin",
    FOSSIL_TEST_VALUE: "preserved",
    GIT_PAGER: "hostile-pager",
    GIT_TERMINAL_PROMPT: "1",
  });
});
