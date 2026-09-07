import type { FocusedSource } from "../../../browser/source.js";

export function sourceFixture(
  content: Pick<FocusedSource,
    "body" | "handles" | "returned_bytes" | "total_bytes" |
    "limit_bytes" | "truncated"
  >,
): FocusedSource {
  return {
    view_id: "view-1",
    symbol: {
      name: "run", kind: "function", path: "src/main.ts",
      symbol_id: "project:run",
    },
    generation: 4,
    ...content,
  };
}
