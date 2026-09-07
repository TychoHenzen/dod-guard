import type { BrowserLandmark, BrowserLandmarkGroup } from "./discovery.js";
import type { BrowserReply } from "./browser-reply-type.js";

export function hasStrings<Key extends string>(
  value: Record<string, unknown>,
  keys: readonly Key[],
): value is Record<Key, string> & Record<string, unknown> {
  return keys.every((key) => typeof value[key] === "string");
}

function landmarkItem(value: unknown): BrowserLandmark | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (!hasStrings(item, ["symbol_id", "name", "path", "kind"]))
    return undefined;
  return {
    symbol_id: item.symbol_id,
    name: item.name,
    path: item.path,
    kind: item.kind,
  };
}

function landmarkGroup(value: unknown): BrowserLandmarkGroup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { group?: unknown; symbols?: unknown };
  if (!hasStrings(candidate, ["group"])) return undefined;
  if (!Array.isArray(candidate.symbols)) return undefined;
  return {
    group: candidate.group,
    items: landmarkItems(candidate.symbols),
  };
}

function landmarkItems(values: unknown[]): BrowserLandmark[] {
  return values.flatMap((item) => {
    const landmark = landmarkItem(item);
    return landmark ? [landmark] : [];
  });
}

export function landmarkGroups(reply: BrowserReply): BrowserLandmarkGroup[] {
  const groups = Array.isArray(reply.data?.landmarks)
    ? reply.data.landmarks
    : [];
  return groups.flatMap((value) => {
    const group = landmarkGroup(value);
    return group ? [group] : [];
  });
}
