import { FossilAnalysisError } from "./analysis-error.js";
import type { GitVersion } from "./git-process-types/git-version.js";
export { discoverGitRepository } from "./git-process-discovery.js";
export { runGitCommand } from "./git-process-command.js";
export {
  SAFE_GIT_BASE_ARGUMENTS,
  safeGitEnvironment,
} from "./git-process-environment.js";

export type { CollectedGitOutput } from "./git-process-types/index.js";
export type { GitIngestionLimits } from "./git-process-types/index.js";
export type { GitOutputCollectionOptions } from "./git-process-types/index.js";
export type { GitPipedChild } from "./git-process-types/index.js";
export type { GitSpawn } from "./git-process-types/index.js";
export type { GitSpawnOptions } from "./git-process-types/index.js";
export type { GitVersion } from "./git-process-types/index.js";

export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";

/** Parses standard Git version evidence for a capability decision. */
export function parseGitVersion(output: string): GitVersion | undefined {
  const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(
    output,
  );
  if (!(match?.[1] && match[2])) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor)
    ? { major, minor }
    : undefined;
}

/** Rejects version evidence that cannot support history analysis. */
export function assertSupportedGitVersion(output: string): GitVersion {
  const version = parseGitVersion(output);
  if (
    !(
      version &&
      (version.major > 2 || (version.major === 2 && version.minor >= 30))
    )
  )
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
