import { markUnresolvedCandidateEvidence, regradeVestigialEdges } from "./ref-analyzer.js";
export declare function referenceSources(root: string, paths: readonly string[]): {
    sources: readonly import("./ref-analyzer.js").ReferenceSourceContent[];
    warnings: readonly import("./types.js").AnalysisWarning[];
    acceptedBytes: number;
    graph: {
        complete: boolean;
        unavailablePaths: string[];
        edges: readonly import("./types.js").ReferenceEdge[];
        unresolved: readonly import("./types.js").UnresolvedReference[];
    };
};
export { markUnresolvedCandidateEvidence, regradeVestigialEdges };
