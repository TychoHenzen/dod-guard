import { runGitCommand } from "./git-process-boundary.js";
export declare function discoverWorkspace(root: string, runGit: typeof runGitCommand): Promise<{
    trackedOutput: import("./git-process-boundary.js").CollectedGitOutput;
    untrackedOutput: import("./git-process-boundary.js").CollectedGitOutput;
    ignoredOutput: import("./git-process-boundary.js").CollectedGitOutput;
    untracked: readonly string[];
    ignored: readonly string[];
}>;
