import { type ChildProcess, spawn } from "node:child_process";

export interface GitSpawnOptions {
  readonly shell: false;
  readonly windowsHide: true;
}

export type GitSpawn = (command: string, arguments_: readonly string[], options: GitSpawnOptions) => ChildProcess;

function spawnGit(command: string, arguments_: readonly string[], options: GitSpawnOptions): ChildProcess {
  return spawn(command, [...arguments_], options);
}

/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export function discoverGitRepository(repositoryPath: string, runGit: GitSpawn = spawnGit): ChildProcess {
  return runGit("git", ["-C", repositoryPath, "rev-parse", "--show-toplevel"], {
    shell: false,
    windowsHide: true,
  });
}
