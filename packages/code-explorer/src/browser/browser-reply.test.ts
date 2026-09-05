import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusedSource, landmarkGroups } from "./browser-reply.js";

describe("browser reply parsing", () => {
  it("keeps only complete landmark symbols", () => {
    assert.deepEqual(
      landmarkGroups({
        data: {
          landmarks: [
            {
              group: "entry_points",
              symbols: [
                { symbol_id: "main", name: "main", path: "src/main.ts", kind: "function" },
                { name: "missing identity" },
              ],
            },
          ],
        },
      }),
      [
        {
          group: "entry_points",
          items: [{ symbol_id: "main", name: "main", path: "src/main.ts", kind: "function" }],
        },
      ],
    );
  });

  it("maps a complete focus reply and rejects an incomplete reply", () => {
    const source = focusedSource({
      project_generation: 2,
      data: {
        view_id: "view-main",
        symbol_id: "main",
        name: "main",
        kind: "function",
        path: "src/main.ts",
        content: { body: "export function main() {}", returned_bytes: 25, total_bytes: 25, limit_bytes: 100 },
      },
    });
    assert.equal(source?.generation, 2);
    assert.equal(source?.body, "export function main() {}");
    assert.equal(focusedSource({ data: { view_id: "missing-fields" } }), undefined);
  });
});
