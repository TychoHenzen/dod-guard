import type { SemanticRequest, SemanticResult } from "./contract.js";

export type SemanticQuery = (
  request: SemanticRequest,
) => Promise<SemanticResult>;
