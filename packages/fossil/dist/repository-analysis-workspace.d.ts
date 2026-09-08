import { runGitCommand } from "./git-process-boundary.js";
import type { NormalizedAnalysisOptions } from "./types.js";
export declare function analyzeWorkspaceStage(root: string, options: NormalizedAnalysisOptions, runGit: typeof runGitCommand, analysisTimestampMs: number): Promise<{
    references: {
        sources: readonly import("./reference-analysis-core.js").ReferenceSourceContent[];
        warnings: readonly import("./types.js").AnalysisWarning[];
        acceptedBytes: number;
        graph: {
            complete: boolean;
            unavailablePaths: string[];
            edges: readonly import("./types.js").ReferenceEdge[];
            unresolved: readonly import("./types.js").UnresolvedReference[];
        };
    };
    workspaceCandidates: (import("./workspace-debris-boundary.js").IgnoredWorkspaceCandidate | import("./workspace-debris-boundary.js").UntrackedWorkspaceCandidate)[];
    inventory: string[];
    warnings: import("./types.js").AnalysisWarning[];
    gitOutputs: import("./git-process-boundary.js").CollectedGitOutput[];
}>;
