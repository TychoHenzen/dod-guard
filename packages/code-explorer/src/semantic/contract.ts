import { z } from "zod";

export const languages = ["rust", "python", "csharp"] as const;
export type Language = (typeof languages)[number];

export const relationNames = [
  "definition",
  "references",
  "type_definition",
  "implementation",
  "callers",
  "callees",
] as const;
export type RelationName = (typeof relationNames)[number];

export type Position = { line: number; character: number };
export type SourceRange = { start: Position; end: Position };
export type ProjectLocation = { path: string; range: SourceRange };
export type ExternalLocation = { external: true };
export type SourceLocation = ProjectLocation | ExternalLocation;

export type SymbolIdentity = {
  id: string;
  name: string;
  language: Language;
  kind: string;
  location: ProjectLocation;
};

export type ProjectRevision = { generation: number; manifest_sha256: string };

export type RelationCapability =
  | { state: "ready" }
  | { state: "unavailable" }
  | { state: "failed"; failure_code: string };

export type RelationCapabilities = Record<RelationName, RelationCapability>;
export type BackendState = "initializing" | "ready" | "degraded" | "refreshing" | "unavailable" | "failed";

export type BackendStatus = {
  language: Language;
  backend_name: string;
  backend_version: string;
  discovery_source: "injected" | "server_path";
  state: BackendState;
  capabilities: RelationCapabilities;
  last_transition_time: number;
  failure_code?: string;
};

export type SearchRequest = { operation: "search"; query: string };
export type FocusRequest = { operation: "focus"; symbol_id: string };
export type RelationRequest = { operation: RelationName; symbol_id: string };
export type SemanticRequest = SearchRequest | FocusRequest | RelationRequest;

export type SearchResult = { operation: "search"; revision: ProjectRevision; symbols: SymbolIdentity[] };
export type FocusResult = { operation: "focus"; revision: ProjectRevision; symbol: SymbolIdentity };
export type RelationResult = {
  operation: RelationName;
  revision: ProjectRevision;
  relations: Array<
    | { relation: RelationName; symbol: SymbolIdentity; location: SourceLocation }
    | { relation: RelationName; external: { external: true } }
  >;
};
export type SemanticResult = SearchResult | FocusResult | RelationResult;

const positionSchema = z
  .object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() })
  .strict();
const rangeSchema = z.object({ start: positionSchema, end: positionSchema }).strict();
const relativePathSchema = z
  .string()
  .min(1)
  .refine((path) => !(path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")));
const projectLocationSchema = z.object({ path: relativePathSchema, range: rangeSchema }).strict();
const externalLocationSchema = z.object({ external: z.literal(true) }).strict();
const sourceLocationSchema = z.union([projectLocationSchema, externalLocationSchema]);
const symbolSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    language: z.enum(languages),
    kind: z.string().min(1),
    location: projectLocationSchema,
  })
  .strict();
const revisionSchema = z
  .object({ generation: z.number().int().nonnegative(), manifest_sha256: z.string().min(1) })
  .strict();

export const semanticRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), query: z.string() }).strict(),
  z.object({ operation: z.literal("focus"), symbol_id: z.string().min(1) }).strict(),
  ...relationNames.map((operation) =>
    z.object({ operation: z.literal(operation), symbol_id: z.string().min(1) }).strict(),
  ),
]);

export const semanticResultSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), revision: revisionSchema, symbols: z.array(symbolSchema) }).strict(),
  z.object({ operation: z.literal("focus"), revision: revisionSchema, symbol: symbolSchema }).strict(),
  ...relationNames.map((operation) =>
    z
      .object({
        operation: z.literal(operation),
        revision: revisionSchema,
        relations: z.array(
          z.union([
            z.object({ relation: z.literal(operation), symbol: symbolSchema, location: sourceLocationSchema }).strict(),
            z.object({ relation: z.literal(operation), external: externalLocationSchema }).strict(),
          ]),
        ),
      })
      .strict(),
  ),
]);

export function createProjectRevision(generation: number, manifestSha256: string): ProjectRevision {
  return revisionSchema.parse({ generation, manifest_sha256: manifestSha256 });
}

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
