import type { SemanticRequest } from "./contract-request.js";
import { semanticRequestSchema } from "./contract-request-schema.js";
import type { SemanticResult } from "./contract-result.js";
import { semanticResultSchema } from "./contract-result-schema.js";

export type { RelationCapabilities } from "./contract-capabilities.js";
export type { FocusContent } from "./contract-focus.js";
export type { Language } from "./contract-language.js";
export type { RelationName } from "./contract-relation-name.js";
export type { RelationResult } from "./contract-relation-result.js";
export type { SemanticRequest } from "./contract-request.js";
export type { SemanticResult } from "./contract-result.js";
export type { ProjectRevision } from "./contract-revision.js";
export type { BackendStatus } from "./contract-status.js";
export type { SymbolIdentity } from "./contract-symbol.js";
export {
  languages,
  relationNames,
} from "./contract-values.js";

export function parseSemanticRequest(input: unknown): SemanticRequest {
  const parsed = semanticRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid semantic request");
  return parsed.data;
}

export function parseSemanticResult(input: unknown): SemanticResult {
  const parsed = semanticResultSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid semantic result");
  return parsed.data;
}
