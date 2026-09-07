import { readyGroupedLandmarks } from "../../../discovery/landmarks.js";
export function boundedEntries() {
  return readyGroupedLandmarks(
    Array.from({ length: 13 }, (_, index) => ({
      symbol: {
        symbol_id: `entry-${index}`,
        name: "main",
        path: "src/main.rs",
        kind: "function",
      },
      references: [{ path: "app/entry.rs", content: "production" as const }],
    })),
    12,
  );
}
