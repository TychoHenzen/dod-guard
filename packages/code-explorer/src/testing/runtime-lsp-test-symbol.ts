import { testLocation } from "./semantic-test-shapes.js";

export function runtimeEntrySymbol() {
  return {
    id: "entry",
    name: "helper",
    language: "rust" as const,
    kind: "function" as const,
    location: testLocation(
      "a.rs",
      { line: 0, character: 7 },
      { line: 0, character: 13 },
    ),
  };
}
