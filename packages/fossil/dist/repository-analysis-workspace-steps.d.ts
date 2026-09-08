import { runGitCommand } from "./git-process-boundary.js";
import { inspectWorkspaceFileMetadataWithWarnings, parseVerboseCheckIgnore } from "./workspace-debris-boundary.js";
export { discoverWorkspace, } from "./repository-analysis-workspace-discovery.js";
export { assertWorkspaceInventoryLimit, buildWorkspaceInventory, } from "./repository-analysis-workspace-inventory.js";
export declare function inspectWorkspacePaths(root: string, paths: readonly string[], exclude: readonly string[]): import("./workspace-debris-boundary.js").WorkspaceMetadataInspectionResult;
export declare function readIgnoredProvenance({ root, ignored, exclude, runGit, }: {
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
}): (import("./workspace-debris-boundary.js").UntrackedWorkspaceCandidate | import("./workspace-debris-boundary.js").IgnoredWorkspaceCandidate)[];
