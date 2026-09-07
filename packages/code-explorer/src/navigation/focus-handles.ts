import type { FocusContent } from "../semantic/api/public-api.js";
import type { FocusHandle } from "./focus-handle.js";
import { browserRelationNames } from "./focus-relation-names.js";
import { mintOpaqueId } from "./opaque-id.js";

export function focusHandles(
  detail: FocusContent | undefined,
  source: string | undefined,
  bodyLength: number,
) {
  let searchFrom = 0;
  return (detail?.visible_symbols ?? []).map((symbol) => {
    const result = makeFocusHandle({
      name: symbol.name,
      symbolId: symbol.symbol_id,
      source,
      searchFrom,
      bodyLength,
    });
    searchFrom = result.nextSearchFrom;
    return result.handle;
  });
}

function makeFocusHandle(options: {
  name: string;
  symbolId: string;
  source: string | undefined;
  searchFrom: number;
  bodyLength: number;
}): {
  handle: FocusHandle;
  nextSearchFrom: number;
} {
  const { name, symbolId, source, searchFrom, bodyLength } = options;
  const start = source?.indexOf(name, searchFrom) ?? -1;
  const end = start >= 0 ? start + name.length : -1;
  return {
    handle: {
      handle: mintOpaqueId(),
      name,
      symbol_id: symbolId,
      start: Math.max(start, 0),
      end: Math.max(end, 0),
      out_of_range: start < 0 || end > bodyLength,
      relations: browserRelationNames,
    },
    nextSearchFrom: start >= 0 ? end : searchFrom,
  };
}
