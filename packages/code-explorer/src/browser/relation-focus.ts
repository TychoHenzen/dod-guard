import type { BrowserFocus } from "./focus-navigation.js";
import type { RelationCandidate } from "./relation-candidate.js";
import { relationHandles, relationName } from "./relation-data.js";
import {
  hasFocusPayload,
  relationBody,
  relationGeneration,
  relationLimit,
  relationReturnedBytes,
  relationTotalBytes,
} from "./relation-focus-support.js";
import type { FocusedSource } from "./source.js";

export function relationFocus(
  candidate: RelationCandidate,
): BrowserFocus | undefined {
  if (!hasFocusPayload(candidate)) return;
  const body = relationBody(candidate.content);
  if (typeof body !== "string") return;
  const source = focusedSource(candidate, body);
  return {
    view_id: source.view_id,
    symbol_id: source.symbol.symbol_id,
    name: source.symbol.name,
    source,
  };
}

function focusedSource(
  candidate: RelationCandidate & {
    view_id: string;
    symbol_id: string;
    path: string;
    kind: string;
    content: NonNullable<RelationCandidate["content"]>;
  },
  body: string,
): FocusedSource {
  const returnedBytes = relationReturnedBytes(candidate.content, body);
  const totalBytes = relationTotalBytes(candidate.content, returnedBytes);
  return {
    view_id: candidate.view_id,
    symbol: {
      name: relationName(candidate),
      kind: candidate.kind,
      path: candidate.path,
      symbol_id: candidate.symbol_id,
    },
    generation: relationGeneration(candidate),
    body,
    handles: relationHandles(candidate),
    returned_bytes: returnedBytes,
    total_bytes: totalBytes,
    limit_bytes: relationLimit(candidate.content, totalBytes),
    truncated: candidate.content.truncated === true,
  };
}
