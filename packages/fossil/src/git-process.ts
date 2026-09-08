import { type ChildProcess, spawn } from "node:child_process";
import { FossilAnalysisError } from "./analysis-error.js";
import { collectBoundedGitOutput } from "./git-output-collector.js";
import { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
import type { GitIngestionLimits } from "./git-process-types/git-ingestion-limits.js";
import type { GitOutputCollectionOptions } from "./git-process-types/git-output-collection-options.js";
import type { GitPipedChild } from "./git-process-types/git-piped-child.js";
import type { GitSpawn } from "./git-process-types/git-spawn.js";
import type { GitSpawnOptions } from "./git-process-types/git-spawn-options.js";
import type { GitVersion } from "./git-process-types/git-version.js";

export type { CollectedGitOutput } from "./git-process-types/index.js";
export type { GitIngestionLimits } from "./git-process-types/index.js";
export type { GitOutputCollectionOptions } from "./git-process-types/index.js";
export type { GitPipedChild } from "./git-process-types/index.js";
export type { GitSpawn } from "./git-process-types/index.js";
export type { GitSpawnOptions } from "./git-process-types/index.js";
export type { GitVersion } from "./git-process-types/index.js";

export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";

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

/** Runs one noninteractive Git command and retains only bounded collected output. */
export async function runGitCommand({ arguments_, repositoryPath, input, historyMode = false }: {
  arguments_: readonly string[];
  repositoryPath?: string;
  input?: string;
  historyMode?: boolean;
}): Promise<CollectedGitOutput> {
  const scopedArguments = repositoryPath === undefined ? arguments_ : ["-C", repositoryPath, ...arguments_];
  const child = spawn("git", [...SAFE_GIT_BASE_ARGUMENTS, ...scopedArguments], {
    shell: false,
    windowsHide: true,
    env: safeGitEnvironment(),
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (input !== undefined) child.stdin?.end(input);
  return collectBoundedGitOutput(child, { historyMode });
}
