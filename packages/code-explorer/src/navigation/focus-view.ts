import { stableSymbolId } from "./stable-symbol-id.js";

export { stableSymbolId } from "./stable-symbol-id.js";

import type {
  FocusContent,
  SymbolIdentity,
} from "../semantic/api/public-api.js";
import { FocusBodyLimitError } from "./focus-body-limit-error.js";
import { focusContent, focusSource } from "./focus-content.js";
import type { FocusHandle } from "./focus-handle.js";
import { focusHandles } from "./focus-handles.js";
import type { FocusView } from "./focus-view-type.js";
import { mintOpaqueId } from "./opaque-id.js";

const DEFAULT_BODY_LIMIT_BYTES = 32 * 1024;
const MIN_BODY_LIMIT_BYTES = 1024;
const MAX_BODY_LIMIT_BYTES = 128 * 1024;

export { FocusBodyLimitError } from "./focus-body-limit-error.js";
export type { FocusHandle } from "./focus-handle.js";
export type { FocusView } from "./focus-view-type.js";

export { mintOpaqueId } from "./opaque-id.js";
/** Creates an immutable response from semantic content without reading a
 * source file itself.
 */
export function createFocusView(
  ...args: [
    symbol: SymbolIdentity,
    detail: FocusContent | undefined,
    requestedLimit?: number,
    projectGeneration?: number,
  ]
): FocusView {
  const [symbol, detail, requestedLimit, projectGeneration = 0] = args;
  const limit = bodyLimit(requestedLimit);
  assertBodyLimit(limit);

  const content = focusContent(detail, limit);
  const symbolId = stableSymbolId(symbol);
  const handles = focusHandles(
    detail,
    focusSource(detail),
    (content.body ?? content.declaration ?? "").length,
  );
  return makeFocusView({
    symbol,
    projectGeneration,
    content,
    symbolId,
    handles,
  });
}
function bodyLimit(requestedLimit: number | undefined): number {
  return requestedLimit ?? DEFAULT_BODY_LIMIT_BYTES;
}

function assertBodyLimit(limit: number): void {
  if (!validBodyLimit(limit)) throw new FocusBodyLimitError(limit);
}

function validBodyLimit(limit: number): boolean {
  if (!Number.isInteger(limit)) return false;
  return limit >= MIN_BODY_LIMIT_BYTES && limit <= MAX_BODY_LIMIT_BYTES;
}

function makeFocusView(options: {
  symbol: SymbolIdentity;
  projectGeneration: number;
  content: ReturnType<typeof focusContent>;
  symbolId: string;
  handles: ReturnType<typeof focusHandles>;
}): FocusView {
  const { symbol, projectGeneration, content, symbolId, handles } = options;
  return {
    view_id: mintOpaqueId(),
    project_generation: projectGeneration,
    symbol_id: symbolId,
    name: symbol.name,
    qualified_name: symbol.qualified_name ?? symbol.name,
    language: symbol.language,
    kind: symbol.kind,
    path: symbol.location.path.replaceAll("\\", "/"),
    range: symbol.location.range,
    content,
    handles,
  };
}
