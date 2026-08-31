import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./encapsulation.js";
import { analyzeRefactorProgress } from "./refactor-progress.js";

// covers: quality-guard/architecture-analysis :: Refactor analysis reports structural progress :: Responsibility moves to a focused module
test("reports an operation ownership move and reduced dependency on the old owner as structural progress", () => {
  const before: ArchitectureFileFact[] = [
    {
      path: "src/coordinator.ts",
      imports: ["./ledger"],
      references: [],
      types: [
        {
          name: "Coordinator",
          members: [{ name: "reconcile", kind: "method", visibility: "public" }],
          dependencies: ["Ledger"],
          forwardingPaths: [],
        },
      ],
    },
    { path: "src/ledger.ts", imports: [], references: [], types: [{ name: "Ledger", members: [], dependencies: [], forwardingPaths: [] }] },
  ];
  const after: ArchitectureFileFact[] = [
    { path: "src/coordinator.ts", imports: [], references: [], types: [{ name: "Coordinator", members: [], dependencies: [], forwardingPaths: [] }] },
    {
      path: "src/reconciliation/reconciler.ts",
      imports: ["../ledger"],
      references: [],
      types: [
        {
          name: "Reconciler",
          members: [{ name: "reconcile", kind: "method", visibility: "public" }],
          dependencies: ["Ledger"],
          forwardingPaths: [],
        },
      ],
    },
    { path: "src/ledger.ts", imports: [], references: [], types: [{ name: "Ledger", members: [], dependencies: [], forwardingPaths: [] }] },
  ];

  const result = analyzeRefactorProgress(before, after, ["src/coordinator.ts", "src/reconciliation/reconciler.ts"], parseQualityConfig("{}"));
  assert.equal(result.hasArchitecturalProgress, true);
  assert.deepEqual(result.ownershipMoves, [{ operation: "reconcile", from: "Coordinator", to: "Reconciler" }]);
  assert.equal(result.indicators.ownership.status, "improved");
  assert.equal(result.indicators.dependencyEdges.status, "improved");
  assert.equal(result.indicators.compatibilityPaths.status, "unchanged");
});

// covers: quality-guard/architecture-analysis :: Refactor analysis reports structural progress :: Refactor only renames and reformats
test("reports no architectural progress when only names and formatting change", () => {
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
    { path: "src/clock.ts", imports: [], references: [], types: [{ name: "Clock", members: [], dependencies: [], forwardingPaths: [] }] },
  ];
  const after = structuredClone(before);
  const result = analyzeRefactorProgress(before, after, ["src/service.ts"], parseQualityConfig("{}"));
  assert.equal(result.hasArchitecturalProgress, false);
  assert.deepEqual(
    Object.values(result.indicators).map((indicator) => indicator.status),
    ["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"],
  );
});
