import { runGitCommand } from "./git-process-boundary.js";
import { inspectWorkspaceFileMetadataWithWarnings, parseVerboseCheckIgnore } from "./workspace-debris-boundary.js";
export declare function discoverWorkspace(root: string, runGit: typeof runGitCommand): Promise<{
    trackedOutput: import("./git-process-boundary.js").CollectedGitOutput;
    untrackedOutput: import("./git-process-boundary.js").CollectedGitOutput;
    ignoredOutput: import("./git-process-boundary.js").CollectedGitOutput;
    untracked: readonly string[];
    ignored: readonly string[];
}>;
export declare function inspectWorkspacePaths(root: string, paths: readonly string[], exclude: readonly string[]): import("./workspace-debris-boundary.js").WorkspaceMetadataInspectionResult;
export declare function readIgnoredProvenance({ root, ignored, exclude, runGit }: {
    root: string;
    ignored: readonly string[];
    exclude: readonly string[];
    runGit: typeof runGitCommand;
}): Promise<{
    ignoreOutput: undefined;
    ignoredProvenance: readonly import("./workspace-debris-boundary.js").IgnoreProvenance[];
} | {
    ignoreOutput: import("./git-process-boundary.js").CollectedGitOutput;
    ignoredProvenance: readonly import("./workspace-debris-boundary.js").IgnoreProvenance[];
}>;
export declare function buildWorkspaceCandidates(input: {
    untrackedMetadata: ReturnType<typeof inspectWorkspaceFileMetadataWithWarnings>;
    ignoredMetadata: ReturnType<typeof inspectWorkspaceFileMetadataWithWarnings>;
    ignoredProvenance: ReturnType<typeof parseVerboseCheckIgnore>;
    analysisTimestampMs: number;
    minimumAgeDays: number;
}): (import("./workspace-debris-boundary.js").IgnoredWorkspaceCandidate | import("./workspace-debris-boundary.js").UntrackedWorkspaceCandidate)[];
export declare function buildWorkspaceInventory(input: {
    trackedOutput: string;
    workspaceCandidates: readonly {
        readonly path: string;
    }[];
}): string[];
export declare function assertWorkspaceInventoryLimit(inventory: readonly string[]): void;
