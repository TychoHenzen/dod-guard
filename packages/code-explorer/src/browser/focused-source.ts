import type { SourceHandle } from "./source-handle.js";

export type FocusedSource = {
  view_id: string;
  symbol: { name: string; kind: string; path: string; symbol_id: string };
  generation: number;
  body: string;
  handles: readonly SourceHandle[];
  returned_bytes: number;
  total_bytes: number;
  limit_bytes: number;
  truncated: boolean;
};
