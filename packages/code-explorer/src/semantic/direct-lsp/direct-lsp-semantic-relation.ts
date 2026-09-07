import type { RelationName, SymbolIdentity } from "../contracts/contract.js";

export type Relation =
  | {
      relation: RelationName;
      symbol: SymbolIdentity;
      location: SymbolIdentity["location"];
      call_site?: SymbolIdentity["location"];
    }
  | {
      relation: RelationName;
      external: { external: true };
    };
