import type { FocusHandle } from "./focus-handle.js";
import type { SymbolIdentity } from "../semantic/api/public-api.js";

export type FocusView = {
  view_id: string;
  project_generation: number;
  symbol_id: string;
  name: string;
  qualified_name: string;
  language: string;
  kind: string;
  path: string;
  range: SymbolIdentity["location"]["range"];
  content: {
    body?: string;
    declaration?: string;
    truncated: boolean;
    limit_bytes: number;
    returned_bytes: number;
    total_bytes: number;
  };
  handles: readonly FocusHandle[];
};
