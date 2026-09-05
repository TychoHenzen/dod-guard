import type { FocusedSource } from "./source.js";

const relationNames = ["definition", "references", "callers", "callees", "type", "implementation"] as const;

export function sourceHandles(data: Record<string, unknown>, body: string): FocusedSource["handles"] {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles: FocusedSource["handles"][number][] = [];
  let occupiedUntil = 0;
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.handle !== "string" || typeof candidate.name !== "string") continue;
    const start = body.indexOf(candidate.name, occupiedUntil);
    if (start < 0) continue;
    const end = start + candidate.name.length;
    handles.push({ handle: candidate.handle, start, end, relations: relationNames });
    occupiedUntil = end;
  }
  return handles;
}
