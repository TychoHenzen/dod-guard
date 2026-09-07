import type { GraphRelationGroup } from "./graph-relation-group.js";

export type GraphRelationInput = {
  relation: GraphRelationGroup["relation"] | "implementation";
  state: GraphRelationGroup["state"];
  candidates: readonly {
    symbol_id?: string;
    name?: string;
    display_name?: string;
    local_handle?: string;
    external: boolean;
    discovery_only?: boolean;
  }[];
  omitted_count: number;
};
