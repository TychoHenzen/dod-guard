import assert from "node:assert/strict";
import { it } from "node:test";
import { createFocusView } from "../../../navigation/focus-view.js";
import { assertFocusIdentity } from "./assert-focus-identity.js";
import { focusTwice } from "./focus-twice.js";

it(
  "focuses one semantic function into a new immutable view " +
    "with visible handles",
  async () => {
    const { first, second } = await focusTwice();
    assert.equal("code" in first, false);
    assert.equal("code" in second, false);
    if ("code" in first || "code" in second)
      throw new Error("expected focus views");
    const view = first.data as ReturnType<typeof createFocusView>;
    assertFocusIdentity(view);
    assert.deepEqual(
      view.handles.map(({ name, symbol_id, out_of_range }) => [
        name,
        symbol_id,
        out_of_range,
      ]),
      [
        ["TypeName", "type-id", false],
        ["not_visible", "hidden-id", true],
      ],
    );
    assert.notEqual(
      view.view_id,
      (second.data as ReturnType<typeof createFocusView>).view_id,
    );
  },
);
