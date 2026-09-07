import type { FocusedSource } from "./source.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasHandleShape(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate.handle === "string" &&
    typeof candidate.start === "number" &&
    typeof candidate.end === "number" &&
    Array.isArray(candidate.relations) &&
    candidate.out_of_range !== true
  );
}

function hasValidRange(
  candidate: Record<string, unknown>,
  body: string,
): boolean {
  return (
    Number.isInteger(candidate.start) &&
    Number.isInteger(candidate.end) &&
    (candidate.start as number) >= 0 &&
    (candidate.end as number) <= body.length
  );
}

function stringRelations(candidate: Record<string, unknown>): string[] {
  return (candidate.relations as unknown[]).filter(
    (relation): relation is string => typeof relation === "string",
  );
}

export function sourceHandles(
  data: Record<string, unknown>,
  body: string,
): FocusedSource["handles"] {
  const candidates = Array.isArray(data.handles) ? data.handles : [];
  const handles: FocusedSource["handles"][number][] = [];
  for (const value of candidates) {
    const handle = sourceHandle(value, body);
    if (handle) handles.push(handle);
  }
  return handles;
}

function sourceHandle(
  value: unknown,
  body: string,
): FocusedSource["handles"][number] | undefined {
  if (!isRecord(value) || !hasHandleShape(value) || !hasValidRange(value, body))
    return undefined;
  return {
    handle: value.handle as string,
    start: value.start as number,
    end: value.end as number,
    relations: stringRelations(value),
  };
}
