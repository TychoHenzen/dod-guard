import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sourceHandles } from "./source-handles.js";

describe("source handles", () => {
  it("maps repeated names to ordered, non-overlapping source spans", () => {
    const handles = sourceHandles(
      {
        handles: [
          { handle: "first", name: "value" },
          { handle: "second", name: "value" },
        ],
      },
      "value + value",
    );
    assert.deepEqual(
      handles.map(({ handle, start, end }) => ({ handle, start, end })),
      [
        { handle: "first", start: 0, end: 5 },
        { handle: "second", start: 8, end: 13 },
      ],
    );
  });

  it("ignores malformed and absent candidates", () => {
    assert.deepEqual(
      sourceHandles({ handles: [null, { handle: "missing-name" }, { handle: "x", name: "absent" }] }, "body"),
      [],
    );
    assert.deepEqual(sourceHandles({ handles: "invalid" }, "body"), []);
  });
});
