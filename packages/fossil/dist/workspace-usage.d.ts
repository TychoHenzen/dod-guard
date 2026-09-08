import { analyzeReferences, type ReferenceSourceContent } from "./repository-analysis-reference-boundary.js";
/** Detects imports and exact source-string usage evidence. */
export declare function hasInboundWorkspaceUsage(input: {
    candidatePath: string;
    sources: readonly ReferenceSourceContent[];
    inventoryPaths: readonly string[];
    graph?: ReturnType<typeof analyzeReferences>;
}): boolean;
/** Omits candidates with inbound repository-contained usage evidence. */
export declare function omitUsedWorkspaceCandidates<T extends {
    readonly path: string;
}>(candidates: readonly T[], sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): readonly T[];
