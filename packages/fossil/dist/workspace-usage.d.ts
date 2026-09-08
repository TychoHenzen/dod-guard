import { type ReferenceSourceContent } from "./ref-analyzer.js";
/** Detects imports and exact source-string usage evidence. */
export declare function hasInboundWorkspaceUsage(candidatePath: string, sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): boolean;
/** Omits candidates with inbound repository-contained usage evidence. */
export declare function omitUsedWorkspaceCandidates<T extends {
    readonly path: string;
}>(candidates: readonly T[], sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): readonly T[];
