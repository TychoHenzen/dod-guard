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
  count = 1,
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
  const relations = Array.from({ length: count }, (_, index) =>
    relationAtIndex({ relation, symbol, callSite, index }),
  );
  return { operation: relation, revision: revision(), relations };
}

function relationAtIndex(input: {
  relation: "definition" | "references" | "callers" | "callees";
  symbol: typeof type;
  callSite: object;
  index: number;
}) {
  const { relation, symbol, callSite, index } = input;
  if (index === 0)
    return { relation, symbol, location: symbol.location, ...callSite };
  const path = symbol.location.path.replace(/\.rs$/u, `-${index}.rs`);
  const candidate = {
    ...symbol,
    id: `${symbol.id}-${index}`,
    location: { ...symbol.location, path },
  };
  return {
    relation,
    symbol: candidate,
    location: candidate.location,
    ...callSite,
  };
}
