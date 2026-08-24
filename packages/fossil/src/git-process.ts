import { type ChildProcess, spawn } from "node:child_process";

export interface GitSpawnOptions {
  readonly shell: false;
  readonly windowsHide: true;
  readonly env: NodeJS.ProcessEnv;
}

export type GitSpawn = (command: string, arguments_: readonly string[], options: GitSpawnOptions) => ChildProcess;

function spawnGit(command: string, arguments_: readonly string[], options: GitSpawnOptions): ChildProcess {
  return spawn(command, [...arguments_], options);
}

/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = ["--no-pager"] as const;

/** Keeps caller environment values while overriding Git's interactive process controls. */
export function safeGitEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}

/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export function discoverGitRepository(
  repositoryPath: string,
  runGit: GitSpawn = spawnGit,
  environment: NodeJS.ProcessEnv = process.env,
): ChildProcess {
  return runGit("git", [...SAFE_GIT_BASE_ARGUMENTS, "-C", repositoryPath, "rev-parse", "--show-toplevel"], {
    shell: false,
    windowsHide: true,
    env: safeGitEnvironment(environment),
  });
}
