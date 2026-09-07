import { Buffer } from "node:buffer";
import type { FocusContent } from "../semantic/api/public-api.js";

function boundUtf8(value: string, limit: number) {
  const totalBytes = Buffer.byteLength(value, "utf8");
  if (totalBytes <= limit)
    return { value, truncated: false, returnedBytes: totalBytes, totalBytes };
  let prefix = "";
  let returnedBytes = 0;
  for (const codePoint of value) {
    const bytes = Buffer.byteLength(codePoint, "utf8");
    if (returnedBytes + bytes > limit) break;
    prefix += codePoint;
    returnedBytes += bytes;
  }
  return { value: prefix, truncated: true, returnedBytes, totalBytes };
}

export function focusSource(detail: FocusContent | undefined): string {
  if (detail?.body !== undefined) return detail.body;
  if (detail?.declaration !== undefined) return detail.declaration;
  return "";
}

function contentFields(
  detail: FocusContent | undefined,
  value: string,
): Record<string, string> {
  if (detail?.body !== undefined) return { body: value };
  if (detail?.declaration !== undefined) return { declaration: value };
  return {};
}

export function focusContent(detail: FocusContent | undefined, limit: number) {
  const bounded = boundUtf8(focusSource(detail), limit);
  return {
    ...contentFields(detail, bounded.value),
    truncated: bounded.truncated,
    limit_bytes: limit,
    returned_bytes: bounded.returnedBytes,
    total_bytes: bounded.totalBytes,
  };
}
