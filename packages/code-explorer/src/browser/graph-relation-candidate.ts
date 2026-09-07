export type GraphRelationCandidate = {
  symbol_id: string;
  name: string;
  external?: boolean;
  discovery_only?: boolean;
  known_relations?: readonly string[];
};
