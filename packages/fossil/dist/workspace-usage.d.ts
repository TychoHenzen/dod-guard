import { type ReferenceSourceContent } from "./ref-analyzer.js";
/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export declare function hasInboundWorkspaceUsage(candidatePath: string, sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): boolean;
/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export declare function omitUsedWorkspaceCandidates<T extends {
    readonly path: string;
}>(candidates: readonly T[], sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): readonly T[];
