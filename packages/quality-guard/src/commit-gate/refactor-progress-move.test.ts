import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { parseQualityConfig } from "./config.js";
import { analyzeRefactorProgress } from "./refactor-progress.js";

test(
  "reports an operation ownership move and reduced dependency on the old " +
    "owner as structural progress",
  () => {
    const before: ArchitectureFileFact[] = [
      {
        path: "src/coordinator.ts",
        imports: ["./ledger"],
        references: [],
        types: [
          {
            name: "Coordinator",
            members: [
              { name: "reconcile", kind: "method", visibility: "public" },
            ],
            dependencies: ["Ledger"],
            forwardingPaths: [],
          },
        ],
      },
      {
        path: "src/ledger.ts",
        imports: [],
        references: [],
        types: [
          {
            name: "Ledger",
            members: [],
            dependencies: [],
            forwardingPaths: [],
          },
        ],
      },
    ];
    const after: ArchitectureFileFact[] = [
      {
        path: "src/coordinator.ts",
        imports: [],
        references: [],
        types: [
          {
            name: "Coordinator",
            members: [],
            dependencies: [],
            forwardingPaths: [],
          },
        ],
      },
      {
        path: "src/reconciliation/reconciler.ts",
        imports: ["../ledger"],
        references: [],
        types: [
          {
            name: "Reconciler",
            members: [
              { name: "reconcile", kind: "method", visibility: "public" },
            ],
            dependencies: ["Ledger"],
            forwardingPaths: [],
          },
        ],
      },
      {
        path: "src/ledger.ts",
        imports: [],
        references: [],
        types: [
          {
            name: "Ledger",
            members: [],
            dependencies: [],
            forwardingPaths: [],
          },
        ],
      },
    ];
    const result = analyzeRefactorProgress({
      before,
      after,
      affectedPaths: ["src/coordinator.ts", "src/reconciliation/reconciler.ts"],
      config: parseQualityConfig("{}"),
    });
    assert.equal(result.hasArchitecturalProgress, true);
    assert.deepEqual(result.ownershipMoves, [
      { operation: "reconcile", from: "Coordinator", to: "Reconciler" },
    ]);
    assert.equal(result.indicators.ownership.status, "improved");
    assert.equal(result.indicators.dependencyEdges.status, "improved");
    assert.equal(result.indicators.compatibilityPaths.status, "unchanged");
  },
);
