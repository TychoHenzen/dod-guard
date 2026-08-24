import { type ChildProcess, spawn } from "node:child_process";
import { FossilAnalysisError } from "./analysis-error.js";

export interface GitSpawnOptions {
  readonly shell: false;
  readonly windowsHide: true;
  readonly env: NodeJS.ProcessEnv;
}

export type GitSpawn = (command: string, arguments_: readonly string[], options: GitSpawnOptions) => ChildProcess;

export interface GitVersion {
  readonly major: number;
  readonly minor: number;
}

function spawnGit(command: string, arguments_: readonly string[], options: GitSpawnOptions): ChildProcess {
  return spawn(command, [...arguments_], options);
}

/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="] as const;

/** Keeps caller environment values while overriding Git's interactive process controls. */
export function safeGitEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}

/** Parses the standard Git version evidence needed for a capability decision. */
export function parseGitVersion(output: string): GitVersion | undefined {
  const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
  if (!(match?.[1] && match[2])) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : undefined;
}

/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export function assertSupportedGitVersion(output: string): GitVersion {
  const version = parseGitVersion(output);
  if (!(version && (version.major > 2 || (version.major === 2 && version.minor >= 30))))
    throw new FossilAnalysisError({
      code: "git_capability",
      message: "Git 2.30 or newer is required for history analysis.",
    });
  return version;
}

/** Checks Git capability before calling the later history-reading boundary. */
export async function readHistoryWithSupportedGit<T>(
  readVersion: () => Promise<string>,
  readHistory: () => Promise<T>,
): Promise<T> {
  assertSupportedGitVersion(await readVersion());
  return readHistory();
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
