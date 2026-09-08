import type { ReferenceGraph } from "./types.js";
export declare function candidateBasenameCounts(candidates: readonly string[]): Map<string, number>;
export declare function markUnresolvedReference(unresolved: ReferenceGraph["unresolved"][number], candidates: readonly string[], basenameCounts: ReadonlyMap<string, number>, unavailable: Set<string>): void;
