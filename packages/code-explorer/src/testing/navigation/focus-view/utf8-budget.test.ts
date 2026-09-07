import assert from "node:assert/strict";
import { it } from "node:test";
import { createFocusView } from "../../../navigation/focus-view.js";
import { symbol } from "./symbol.js";

it(
  "returns a UTF-8-safe prefix and byte accounting when a " +
    "focus body exceeds its budget",
  () => {
    const view = createFocusView(
      symbol,
      { body: `${"a".repeat(1023)}😀suffix` },
      1024,
    );
    assert.equal(view.content.body, "a".repeat(1023));
    assert.deepEqual(view.content, {
      body: "a".repeat(1023),
      truncated: true,
      limit_bytes: 1024,
      returned_bytes: 1023,
      total_bytes: 1033,
    });
  },
);
