import type { FocusHandle } from "../navigation/focus-view.js";

export type RelationCandidate = {
  symbol_id?: string;
  name?: string;
  display_name?: string;
  external: boolean;
  discovery_only?: boolean;
  local_handle?: string;
  view_id?: string;
  handle?: string;
  handles?: readonly FocusHandle[];
  content?: {
    body?: string;
    declaration?: string;
    truncated?: boolean;
    limit_bytes?: number;
    returned_bytes?: number;
    total_bytes?: number;
  };
  path?: string;
  kind?: string;
  project_generation?: number;
};
