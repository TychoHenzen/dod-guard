import type { ExternalLocation, ProjectLocation, RelationName, SymbolIdentity } from "./contract.js";

/** A relation returned by a validated language backend. */
type SemanticRelationBase = {
  relation: RelationName;
  relation_source: "semantic";
  backend_name: string;
  backend_version: string;
};

export type ExternalSymbolIdentity = Omit<SymbolIdentity, "location"> & { location: ExternalLocation };

export type ProjectSemanticRelation = SemanticRelationBase & {
  external: false;
  symbol: SymbolIdentity;
  location: ProjectLocation;
  call_site?: ProjectLocation;
  local_handle?: string;
};

export type ExternalSemanticRelation = SemanticRelationBase & {
  external: true;
  symbol: ExternalSymbolIdentity;
  location: ExternalLocation;
  call_site?: never;
  local_handle?: never;
};

export type SemanticRelation = ProjectSemanticRelation | ExternalSemanticRelation;

export function createProjectSemanticRelation(
  relation: Omit<ProjectSemanticRelation, "external" | "relation_source">,
): ProjectSemanticRelation {
  return { ...relation, relation_source: "semantic", external: false };
}

export function createExternalSemanticRelation(
  relation: Omit<ExternalSemanticRelation, "external" | "location" | "relation_source">,
): ExternalSemanticRelation {
  return { ...relation, relation_source: "semantic", external: true, location: relation.symbol.location };
}

/** Structural data is useful for discovery, but never establishes a semantic relation. */
export type StructuralDiscoveryCandidate = {
  symbol: SymbolIdentity;
  location: ProjectLocation;
};

export type SemanticComposition = {
  relations: SemanticRelation[];
  discovery_only?: StructuralDiscoveryCandidate[];
};

/**
 * Keeps backend-proven semantic relations separate from structural discovery
 * candidates, including when both describe the same apparent symbol.
 */
export function composeSemanticRelations(
  relations: readonly SemanticRelation[],
  discoveryCandidates: readonly StructuralDiscoveryCandidate[] = [],
): SemanticComposition {
  return {
    relations: [...relations],
    ...(discoveryCandidates.length > 0 ? { discovery_only: [...discoveryCandidates] } : {}),
  };
}
