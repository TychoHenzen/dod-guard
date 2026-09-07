export function runtimeEntrySymbol() {
  return {
    id: "entry",
    name: "helper",
    language: "rust" as const,
    kind: "function" as const,
    location: {
      path: "a.rs",
      range: { start: { line: 0, character: 7 }, end: { line: 0, character: 13 } },
    },
  };
}
