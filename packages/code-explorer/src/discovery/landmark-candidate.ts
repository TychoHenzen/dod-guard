import type { LandmarkReference } from "./landmark-reference.js";
import type { LandmarkSymbol } from "./landmark-symbol.js";

export type LandmarkCandidate = {
  symbol: LandmarkSymbol;
  references: readonly LandmarkReference[];
  incoming_call_sites?: readonly string[];
  public_or_exported?: boolean;
  generated_only?: boolean;
  entry_point?: boolean;
};
