import type { RelationName } from "./contract-relation-name.js";

export type SemanticRequest =
  | { operation: "search"; query: string }
  | { operation: "focus"; symbol_id: string }
  | { operation: RelationName; symbol_id: string };
