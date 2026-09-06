import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sourceHandles } from "./source-handles.js";

describe("source handles", () => {
  it("maps repeated names to ordered, non-overlapping source spans", () => {
    const handles = sourceHandles(
      {
        handles: [
          { handle: "first", start: 0, end: 5, relations: ["references"] },
          { handle: "second", start: 8, end: 13, relations: ["references"] },
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

  it("uses package-owned offsets and ignores malformed or out-of-range candidates", () => {
    assert.deepEqual(
      sourceHandles(
        {
          handles: [null, { handle: "missing-offset" }, { handle: "out-of-range", start: 0, end: 10, relations: [] }],
        },
        "body",
      ),
      [],
    );
    assert.deepEqual(sourceHandles({ handles: "invalid" }, "body"), []);
  });
});
