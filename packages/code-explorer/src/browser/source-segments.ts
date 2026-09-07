import type { SourceHandle } from "./source-handle.js";
import type { SourceSegment } from "./source-segment.js";
import { validateHandles } from "./source-validation.js";

export function sourceSegments(
  body: string,
  handles: readonly SourceHandle[],
): readonly SourceSegment[] | undefined {
  const validated = validateHandles(body, handles);
  if (!validated) return undefined;
  const segments: SourceSegment[] = [];
  let offset = 0;
  for (const handle of validated) {
    appendHandleSegments({ segments, body, handle, offset });
    offset = handle.end;
  }
  appendTailSegment(segments, body, offset);
  return segments;
}

function appendHandleSegments(options: {
  segments: SourceSegment[];
  body: string;
  handle: SourceHandle;
  offset: number;
}): void {
  const { segments, body, handle, offset } = options;
  if (offset < handle.start)
    segments.push({ text: body.slice(offset, handle.start) });
  segments.push({ text: body.slice(handle.start, handle.end), handle });
}

function appendTailSegment(
  segments: SourceSegment[],
  body: string,
  offset: number,
): void {
  if (offset < body.length || segments.length === 0)
    segments.push({ text: body.slice(offset) });
}
