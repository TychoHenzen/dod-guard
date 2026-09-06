import type { FocusContent } from "./contract-focus.js";
import type { RelationResult } from "./contract-relation-result.js";
import type { ProjectRevision } from "./contract-revision.js";
import type { SymbolIdentity } from "./contract-symbol.js";

export type SemanticResult =
  | {
      operation: "search";
      revision: ProjectRevision;
      symbols: SymbolIdentity[];
    }
  | {
      operation: "focus";
      revision: ProjectRevision;
      symbol: SymbolIdentity;
      content?: FocusContent;
    }
  | RelationResult;
