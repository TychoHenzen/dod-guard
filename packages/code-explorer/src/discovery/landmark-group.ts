import type { LandmarkSymbol } from "./landmark-symbol.js";

export type LandmarkGroup = {
  group: string;
  symbols: readonly LandmarkSymbol[];
  omitted_candidate_count?: number;
};
