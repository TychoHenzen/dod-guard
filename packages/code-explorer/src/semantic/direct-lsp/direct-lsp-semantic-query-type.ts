import type { SemanticRequest, SemanticResult } from "../contracts/contract.js";

export type SemanticQuery = (
  request: SemanticRequest,
) => Promise<SemanticResult>;
