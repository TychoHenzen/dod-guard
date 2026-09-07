import { createFocusView } from "../../../navigation/focus-view.js";
import { symbol } from "./symbol.js";

export function view() {
  return createFocusView(symbol, {
    body: "Type",
    visible_symbols: [{ name: "Type", symbol_id: "target" }],
  });
}
