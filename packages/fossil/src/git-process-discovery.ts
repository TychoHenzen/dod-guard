import { type ChildProcess, spawn } from "node:child_process";
import type { GitSpawn } from "./git-process-types/git-spawn.js";
import type { GitSpawnOptions } from "./git-process-types/git-spawn-options.js";
import {
  SAFE_GIT_BASE_ARGUMENTS,
  safeGitEnvironment,
} from "./git-process-environment.js";

function spawnGit(
  command: string,
  arguments_: readonly string[],
  options: GitSpawnOptions,
): ChildProcess {
  return spawn(command, [...arguments_], options);
}

export function discoverGitRepository(
  repositoryPath: string,
  runGit: GitSpawn = spawnGit,
  environment: NodeJS.ProcessEnv = process.env,
): ChildProcess {
  return runGit(
    "git",
    [
      ...SAFE_GIT_BASE_ARGUMENTS,
      "-C",
      repositoryPath,
      "rev-parse",
      "--show-toplevel",
    ],
    {
      shell: false,
      windowsHide: true,
      env: safeGitEnvironment(environment),
    },
  );
}
