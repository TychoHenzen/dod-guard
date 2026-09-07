import { validBoundary } from "./source-boundary.js";
import type { SourceHandle } from "./source-handle.js";

function validRange(body: string, handle: SourceHandle, end: number): boolean {
  return (
    handle.start >= end &&
    handle.start < handle.end &&
    validBoundary(body, handle.start) &&
    validBoundary(body, handle.end)
  );
}

export function validateHandles(
  body: string,
  handles: readonly SourceHandle[],
): readonly SourceHandle[] | undefined {
  const ordered = [...handles].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let end = 0;
  for (const handle of ordered) {
    if (!validRange(body, handle, end)) return undefined;
    end = handle.end;
  }
  return ordered;
}
