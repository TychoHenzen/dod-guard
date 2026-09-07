import { caller } from "./caller.js";
import { reference } from "./reference.js";
import { revision } from "./revision.js";
import { source } from "./source.js";
import { type } from "./type.js";
export function focusReply() {
  const content = {
    body: "type reference callable",
    visible_symbols: [
      { name: "type", symbol_id: "type" },
      { name: "reference", symbol_id: "reference" },
      { name: "callable", symbol_id: "callable" },
    ],
  };
  return {
    operation: "focus" as const,
    revision: revision(),
    symbol: source,
    content,
  };
}
export function relationReply(
  relation: "definition" | "references" | "callers" | "callees",
) {
  const symbol = {
    definition: type,
    references: reference,
    callers: caller,
    callees: caller,
  }[relation];
  const callSite =
    relation === "callers" || relation === "callees"
      ? { call_site: caller.location }
      : {};
  const target = { relation, symbol, location: symbol.location, ...callSite };
  return { operation: relation, revision: revision(), relations: [target] };
}
