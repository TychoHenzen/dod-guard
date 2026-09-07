import assert from "node:assert/strict";
import { it } from "node:test";
import { createFocusView } from "../../navigation/focus-view.js";

it(
  "marks symbols beyond a multibyte source prefix as out of " + "range",
  () => {
    const symbol = {
      name: "sample",
      language: "rust" as const,
      kind: "function",
      id: "sample-id",
      location: {
        path: "sample.rs",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
      },
    };
    const detail = {
      body: `${"é".repeat(512)}target`,
      visible_symbols: [{ name: "target", symbol_id: "target-id" }],
    };
    const view = createFocusView(symbol, detail, 1024);

    assert.equal(view.content.body, "é".repeat(512));
    assert.equal(view.content.returned_bytes, 1024);
    assert.equal(view.handles[0]?.out_of_range, true);
  },
);
