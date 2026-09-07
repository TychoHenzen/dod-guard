import assert from "node:assert/strict";
import {
  createFocusView,
  stableSymbolId,
} from "../../../navigation/focus-view.js";
import { symbol } from "./symbol.js";

export function assertFocusIdentity(view: ReturnType<typeof createFocusView>) {
  assert.equal(view.symbol_id, stableSymbolId(symbol));
  assert.equal(view.path, "src/lib.rs");
  assert.equal(view.kind, "function");
  assert.equal(
    view.content.body,
    "fn helper(value: TypeName) { TypeName::new(value) }",
  );
  assert.equal(view.content.truncated, false);
}
