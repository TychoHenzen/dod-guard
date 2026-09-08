import { spawn } from "node:child_process";
import { FossilAnalysisError } from "./analysis-error.js";
import { collectBoundedGitOutput } from "./git-output-collector.js";
export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
function spawnGit(command, arguments_, options) {
    return spawn(command, [...arguments_], options);
}
/** Git global options required for every noninteractive fossil subprocess. */
export const SAFE_GIT_BASE_ARGUMENTS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
/** Keeps caller environment values while overriding Git's interactive process controls. */
export function safeGitEnvironment(environment = process.env) {
    return { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" };
}
/** Parses the standard Git version evidence needed for a capability decision. */
export function parseGitVersion(output) {
    const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[^\s]*)?\s*$/.exec(output);
    if (!(match?.[1] && match[2]))
        return undefined;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : undefined;
}
/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export function assertSupportedGitVersion(output) {
    const version = parseGitVersion(output);
    if (!(version && (version.major > 2 || (version.major === 2 && version.minor >= 30))))
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
/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export function discoverGitRepository(repositoryPath, runGit = spawnGit, environment = process.env) {
    return runGit("git", [...SAFE_GIT_BASE_ARGUMENTS, "-C", repositoryPath, "rev-parse", "--show-toplevel"], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(environment),
    });
}
/** Runs one noninteractive Git command and retains only bounded collected output. */
export async function runGitCommand({ arguments_, repositoryPath, input, historyMode = false }) {
    const scopedArguments = repositoryPath === undefined ? arguments_ : ["-C", repositoryPath, ...arguments_];
    const child = spawn("git", [...SAFE_GIT_BASE_ARGUMENTS, ...scopedArguments], {
        shell: false,
        windowsHide: true,
        env: safeGitEnvironment(),
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (input !== undefined)
        child.stdin?.end(input);
    return collectBoundedGitOutput(child, { historyMode });
}
//# sourceMappingURL=git-process.js.map