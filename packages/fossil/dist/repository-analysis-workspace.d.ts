import type { WorkspaceStageInput } from "./repo-workspace-input.js";
export declare function analyzeWorkspaceStage(input: WorkspaceStageInput): Promise<{
    references: {
        sources: readonly import("./reference-analysis-types.js").ReferenceSourceContent[];
        warnings: readonly import("./types.js").AnalysisWarning[];
        acceptedBytes: number;
        graph: {
            complete: boolean;
            unavailablePaths: string[];
            edges: readonly import("./types.js").ReferenceEdge[];
            unresolved: readonly import("./types.js").UnresolvedReference[];
        };
    };
    workspaceCandidates: (import("./workspace-debris.js").IgnoredWorkspaceCandidate | import("./workspace-debris.js").UntrackedWorkspaceCandidate)[];
    inventory: string[];
    warnings: import("./types.js").AnalysisWarning[];
    gitOutputs: import("./git-process-boundary.js").CollectedGitOutput[];
}>;
