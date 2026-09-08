import type { WorkspaceStageInput } from "./repository-analysis-workspace-input.js";
export declare function analyzeWorkspaceStage(input: WorkspaceStageInput): Promise<{
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
    workspaceCandidates: (import("./workspace-debris.js").UntrackedWorkspaceCandidate | import("./workspace-debris.js").IgnoredWorkspaceCandidate)[];
    inventory: string[];
    warnings: import("./types.js").AnalysisWarning[];
    gitOutputs: import("./git-process-boundary.js").CollectedGitOutput[];
}>;
