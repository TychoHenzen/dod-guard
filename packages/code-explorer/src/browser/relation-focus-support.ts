import type { RelationCandidate } from "./relation-candidate.js";

export function relationBody(
  content: NonNullable<RelationCandidate["content"]>,
): string | undefined {
  if (typeof content.body === "string") return content.body;
  return typeof content.declaration === "string"
    ? content.declaration
    : undefined;
}

export function relationReturnedBytes(
  content: NonNullable<RelationCandidate["content"]>,
  body: string,
): number {
  if (typeof content.returned_bytes === "number") return content.returned_bytes;
  return new TextEncoder().encode(body).byteLength;
}

export function relationTotalBytes(
  content: NonNullable<RelationCandidate["content"]>,
  returnedBytes: number,
): number {
  return typeof content.total_bytes === "number"
    ? content.total_bytes
    : returnedBytes;
}

export function relationLimit(
  content: NonNullable<RelationCandidate["content"]>,
  totalBytes: number,
): number {
  return typeof content.limit_bytes === "number"
    ? content.limit_bytes
    : totalBytes;
}

export function relationGeneration(candidate: RelationCandidate): number {
  return typeof candidate.project_generation === "number"
    ? candidate.project_generation
    : 0;
}

export function hasFocusPayload(
  candidate: RelationCandidate,
): candidate is RelationCandidate & {
  view_id: string;
  symbol_id: string;
  path: string;
  kind: string;
  content: NonNullable<RelationCandidate["content"]>;
} {
  return Boolean(
    candidate.view_id &&
      candidate.symbol_id &&
      candidate.path &&
      candidate.kind &&
      candidate.content,
  );
}
