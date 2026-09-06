import type { RelationName } from "./contract-relation-name.js";
import type { ProjectRevision } from "./contract-revision.js";
import type { SymbolIdentity } from "./contract-symbol.js";

export type RelationResult = {
  operation: RelationName;
  revision: ProjectRevision;
  relations: Array<
    | {
        relation: RelationName;
        symbol: SymbolIdentity;
        location: SymbolIdentity["location"] | { external: true };
        call_site?: SymbolIdentity["location"];
      }
    | {
        relation: RelationName;
        external: { external: true; display_name?: string };
      }
  >;
};
