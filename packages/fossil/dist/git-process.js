import { FossilAnalysisError } from "./analysis-error.js";
export { discoverGitRepository } from "./git-process-discovery.js";
export { runGitCommand } from "./git-process-command.js";
export { SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process-environment.js";
export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
/** Parses standard Git version evidence for a capability decision. */
export function parseGitVersion(output) {
    const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
    if (!(match?.[1] && match[2]))
        return undefined;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return Number.isSafeInteger(major) && Number.isSafeInteger(minor)
        ? { major, minor }
        : undefined;
}
/** Rejects version evidence that cannot support history analysis. */
export function assertSupportedGitVersion(output) {
    const version = parseGitVersion(output);
    if (!(version &&
        (version.major > 2 || (version.major === 2 && version.minor >= 30))))
        throw new FossilAnalysisError({
            code: "git_capability",
            message: "Git 2.30 or newer is required for history analysis.",
        });
    return version;
}
/** Checks Git capability before calling the later history-reading boundary. */
export async function readHistoryWithSupportedGit(readVersion, readHistory) {
    assertSupportedGitVersion(await readVersion());
    return readHistory();
}
//# sourceMappingURL=git-process.js.map