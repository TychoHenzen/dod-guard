import type { FocusedSource } from "./source.js";

export function sourceHandles(data: Record<string, unknown>, body: string): FocusedSource["handles"] {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles: FocusedSource["handles"][number][] = [];
  for (const value of candidates) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.handle !== "string" ||
      typeof candidate.start !== "number" ||
      typeof candidate.end !== "number" ||
      !Array.isArray(candidate.relations) ||
      candidate.out_of_range === true
    )
      continue;
    if (!(Number.isInteger(candidate.start) && Number.isInteger(candidate.end))) continue;
    if (candidate.start < 0 || candidate.end > body.length) continue;
    const relations = candidate.relations.filter((relation): relation is string => typeof relation === "string");
    handles.push({ handle: candidate.handle, start: candidate.start, end: candidate.end, relations });
  }
  return handles;
}
