import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { analyzeRefactorProgress } from "./refactor-progress.js";

test(
  "reports no architectural progress when only names and formatting change",
  () => {
  const before: ArchitectureFileFact[] = [
    {
      path: "src/service.ts",
      imports: ["./clock"],
      references: [],
      types: [
        {
          name: "Service",
          members: [{ name: "run", kind: "method", visibility: "public" }],
          dependencies: ["Clock"],
          forwardingPaths: [{ member: "oldRun", target: "worker.run" }],
        },
      ],
    },
    {
      path: "src/clock.ts",
      imports: [],
      references: [],
      types: [
        { name: "Clock", members: [], dependencies: [], forwardingPaths: [] },
      ],
    },
  ];
  const result = analyzeRefactorProgress({
    before,
    after: structuredClone(before),
    affectedPaths: ["src/service.ts"],
    config: parseQualityConfig("{}"),
  });
  assert.equal(result.hasArchitecturalProgress, false);
  assert.deepEqual(
    Object.values(result.indicators).map((indicator) => indicator.status),
    ["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"],
  );
});
