export type { BrowserReply } from "./browser-reply-type.js";
export { landmarkGroups } from "./browser-landmarks-reply.js";
import type { BrowserReply } from "./browser-reply-type.js";
import { hasStrings } from "./browser-landmarks-reply.js";
import type { FocusedSource } from "./source.js";
import { sourceHandles } from "./source-handles.js";

function sourceGeneration(reply: BrowserReply): number {
  if (typeof reply.data?.project_generation === "number")
    return reply.data.project_generation;
  return typeof reply.project_generation === "number"
    ? reply.project_generation
    : 0;
}

function numberField(
  value: Record<string, unknown> | undefined,
  key: string,
): number {
  return typeof value?.[key] === "number" ? value[key] : 0;
}

function firstStringField(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
}

export function focusedSource(reply: BrowserReply): FocusedSource | undefined {
  const data = Object(reply.data) as Record<string, unknown>;
  const content = Object(data.content) as Record<string, unknown>;
  const body = firstStringField(content, ["body", "declaration"]);
  if (!hasStrings(data, ["view_id", "symbol_id", "name", "kind", "path"]))
    return undefined;
  if (typeof body !== "string") return undefined;
  return {
    view_id: data.view_id,
    symbol: {
      name: data.name,
      kind: data.kind,
      path: data.path,
      symbol_id: data.symbol_id,
    },
    generation: sourceGeneration(reply),
    body,
    handles: sourceHandles(data, body),
    returned_bytes: numberField(content, "returned_bytes"),
    total_bytes: numberField(content, "total_bytes"),
    limit_bytes: numberField(content, "limit_bytes"),
    truncated: content.truncated === true,
  };
}
