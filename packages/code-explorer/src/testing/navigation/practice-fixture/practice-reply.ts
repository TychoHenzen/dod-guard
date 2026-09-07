import { revision } from "./revision.js";
import { symbol } from "./symbol.js";

const source = symbol({
  id: "source",
  name: "HelperTarget",
  kind: "function",
  line: 0,
});
const destination = symbol({
  id: "destination",
  name: "Destination",
  kind: "struct",
  line: 1,
});
export function practiceReply(operation: string) {
  if (operation === "search")
    return {
      operation: "search" as const,
      revision: revision(),
      symbols: [source],
    };
  if (operation === "focus") return focusReply();
  if (operation === "definition") return definitionReply();
  throw new Error("backend_unavailable");
}
function focusReply() {
  const content = {
    body: "fn helper_target() { Destination; }",
    visible_symbols: [{ name: "Destination", symbol_id: "destination" }],
  };
  return {
    operation: "focus" as const,
    revision: revision(),
    symbol: source,
    content,
  };
}
function definitionReply() {
  const target = {
    relation: "definition" as const,
    symbol: destination,
    location: destination.location,
  };
  return {
    operation: "definition" as const,
    revision: revision(),
    relations: [target],
  };
}
