import type { ReferenceEdge } from "./reference-edge.js";
import type { UnresolvedReference } from "./unresolved-reference.js";
export interface ReferenceGraph {
    readonly edges: readonly ReferenceEdge[];
    readonly unresolved: readonly UnresolvedReference[];
    readonly complete: boolean;
    readonly unavailablePaths: readonly string[];
}
