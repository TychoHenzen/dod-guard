import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import {
  assertSupportedGitVersion,
  discoverGitRepository,
  type GitSpawn,
  parseGitVersion,
  readHistoryWithSupportedGit,
} from "./git-process.js";

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
      arguments_: [
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "diff.external=",
        "-C",
        repositoryPath,
        "rev-parse",
        "--show-toplevel",
      ],
      options: { shell: false, windowsHide: true, env: { GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" } },
    },
  ]);
  assert.equal(calls[0].arguments_[6], repositoryPath);
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
      arguments_: [
        "--no-pager",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "diff.external=",
        "-C",
        "C:/repositories/example",
        "rev-parse",
        "--show-toplevel",
      ],
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

// covers: fossil/cli :: Safe Git execution :: Repository Git helper is disabled
test("adds config overrides that disable repository filesystem monitors and external diff helpers", () => {
  const calls: Array<{ arguments_: readonly string[] }> = [];
  const runGit: GitSpawn = (_command, arguments_) => {
    calls.push({ arguments_ });
    return new EventEmitter() as never;
  };

  discoverGitRepository("C:/repositories/hostile-config", runGit, {});

  assert.deepEqual(calls[0].arguments_.slice(0, 5), [
    "--no-pager",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "diff.external=",
  ]);
});

// covers: fossil/cli :: Safe Git execution :: Unsupported Git version fails capability check
test("rejects unsupported Git capability evidence before calling the history reader", async () => {
  assert.deepEqual(parseGitVersion("git version 2.30.0.windows.1\n"), { major: 2, minor: 30 });
  assert.deepEqual(assertSupportedGitVersion("git version 3.0.0\n"), { major: 3, minor: 0 });

  for (const output of ["git version 2.29.9\n", "Git version unavailable\n"]) {
    let historyCalls = 0;
    await assert.rejects(
      readHistoryWithSupportedGit(
        async () => output,
        async () => {
          historyCalls += 1;
          return "history";
        },
      ),
      (error: unknown) =>
        error instanceof FossilAnalysisError &&
        error.code === "git_capability" &&
        error.message === "Git 2.30 or newer is required for history analysis.",
    );
    assert.equal(historyCalls, 0);
  }

  assert.equal(
    await readHistoryWithSupportedGit(
      async () => "git version 2.30.0\n",
      async () => "history",
    ),
    "history",
  );
});
