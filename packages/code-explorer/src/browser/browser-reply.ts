import type { BrowserLandmark, BrowserLandmarkGroup } from "./discovery.js";
import type { FocusedSource } from "./source.js";

export type BrowserReply = {
  state?: string;
  code?: string;
  project_generation?: number;
  data?: Record<string, unknown>;
};

function landmarkItem(value: unknown): BrowserLandmark | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (!hasStrings(item, ["symbol_id", "name", "path", "kind"])) return undefined;
  return { symbol_id: item.symbol_id, name: item.name, path: item.path, kind: item.kind };
}

function compactLandmarkItem(value: unknown): BrowserLandmark[] {
  const item = landmarkItem(value);
  return item ? [item] : [];
}

function landmarkGroup(value: unknown): BrowserLandmarkGroup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { group?: unknown; symbols?: unknown };
  if (!hasStrings(candidate, ["group"])) return undefined;
  if (!Array.isArray(candidate.symbols)) return undefined;
  return {
    group: candidate.group,
    items: candidate.symbols.flatMap(compactLandmarkItem),
  };
}

export function landmarkGroups(reply: BrowserReply): BrowserLandmarkGroup[] {
  const groups = Array.isArray(reply.data?.landmarks) ? reply.data.landmarks : [];
  return groups.flatMap((value) => {
    const group = landmarkGroup(value);
    return group ? [group] : [];
  });
}

function sourceGeneration(reply: BrowserReply): number {
  if (typeof reply.data?.project_generation === "number") return reply.data.project_generation;
  return typeof reply.project_generation === "number" ? reply.project_generation : 0;
}

function hasStrings<Key extends string>(
  value: Record<string, unknown>,
  keys: readonly Key[],
): value is Record<Key, string> & Record<string, unknown> {
  return keys.every((key) => typeof value[key] === "string");
}

function numberField(value: Record<string, unknown> | undefined, key: string): number {
  return typeof value?.[key] === "number" ? value[key] : 0;
}

function firstStringField(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
}

export function focusedSource(reply: BrowserReply): FocusedSource | undefined {
  const data = Object(reply.data) as Record<string, unknown>;
  const content = Object(data.content) as Record<string, unknown>;
  const body = firstStringField(content, ["body", "declaration"]);
  if (!hasStrings(data, ["view_id", "symbol_id", "name", "kind", "path"])) return undefined;
  if (typeof body !== "string") return undefined;
  return {
    view_id: data.view_id,
    symbol: { name: data.name, kind: data.kind, path: data.path, symbol_id: data.symbol_id },
    generation: sourceGeneration(reply),
    body,
    handles: [],
    returned_bytes: numberField(content, "returned_bytes"),
    total_bytes: numberField(content, "total_bytes"),
    limit_bytes: numberField(content, "limit_bytes"),
    truncated: content.truncated === true,
  };
}
