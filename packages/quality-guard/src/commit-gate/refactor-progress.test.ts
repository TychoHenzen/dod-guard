import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQualityConfig } from "./config.js";
import { decideQuality } from "./decision-core.js";
import type { ArchitectureFileFact } from "./encapsulation.js";
import { analyzeRefactorProgress } from "./refactor-progress.js";
import { evaluateResponsibilityMap, parseResponsibilityMap } from "./responsibility-map.js";

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
    {
      path: "src/ledger.ts",
      imports: [],
      references: [],
      types: [{ name: "Ledger", members: [], dependencies: [], forwardingPaths: [] }],
    },
  ];
  const after: ArchitectureFileFact[] = [
    {
      path: "src/coordinator.ts",
      imports: [],
      references: [],
      types: [{ name: "Coordinator", members: [], dependencies: [], forwardingPaths: [] }],
    },
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
    {
      path: "src/ledger.ts",
      imports: [],
      references: [],
      types: [{ name: "Ledger", members: [], dependencies: [], forwardingPaths: [] }],
    },
  ];

  const result = analyzeRefactorProgress(
    before,
    after,
    ["src/coordinator.ts", "src/reconciliation/reconciler.ts"],
    parseQualityConfig("{}"),
  );
  assert.equal(result.hasArchitecturalProgress, true);
  assert.deepEqual(result.ownershipMoves, [{ operation: "reconcile", from: "Coordinator", to: "Reconciler" }]);
  assert.equal(result.indicators.ownership.status, "improved");
  assert.equal(result.indicators.dependencyEdges.status, "improved");
  assert.equal(result.indicators.compatibilityPaths.status, "unchanged");
});
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
    {
      path: "src/clock.ts",
      imports: [],
      references: [],
      types: [{ name: "Clock", members: [], dependencies: [], forwardingPaths: [] }],
    },
  ];
  const after = structuredClone(before);
  const result = analyzeRefactorProgress(before, after, ["src/service.ts"], parseQualityConfig("{}"));
  assert.equal(result.hasArchitecturalProgress, false);
  assert.deepEqual(
    Object.values(result.indicators).map((indicator) => indicator.status),
    ["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"],
  );
});
test("requires declared ownership progress instead of accepting local metric improvements", () => {
  const before: ArchitectureFileFact[] = [
    {
      path: "src/service.ts",
      imports: [],
      references: [],
      types: [
        {
          name: "Service",
          members: [{ name: "run", kind: "method", visibility: "private" }],
          dependencies: [],
          forwardingPaths: [],
        },
      ],
    },
  ];
  const map = parseResponsibilityMap(
    '{"targetScope":["src/service.ts"],"responsibilities":[{"name":"run","currentOwners":["Service"],"consumers":[],"dependencies":[]}],"desired":{"ownership":[{"responsibility":"run","owner":"Runner"}],"boundaries":[]}}',
  );
  const progress = evaluateResponsibilityMap(map, before, before, parseQualityConfig("{}"));
  const result = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "index",
      changes: [
        {
          kind: "modify",
          before: { path: "src/service.ts", content: "before" },
          after: { path: "src/service.ts", content: "after" },
        },
      ],
    },
    config: parseQualityConfig("{}"),
    beforeFiles: before,
    afterFiles: before,
    scanner: { findings: [] },
    refactorMap: map,
  });
  assert.equal(progress.hasDeclaredOutcomeProgress, false);
  assert.equal(progress.indicators.ownership.status, "unchanged");
  assert.equal(result.verdict, "REVIEW_REQUIRED");
  assert.ok(result.findings.some((finding) => finding.reason.startsWith("refactor-structural-progress:")));
  assert.deepEqual(result.refactorProgress?.indicators, progress.indicators);
});
test("recognizes when the declared ownership outcome is achieved", () => {
  const before: ArchitectureFileFact[] = [
    {
      path: "src/service.ts",
      imports: [],
      references: [],
      types: [
        {
          name: "Service",
          members: [{ name: "run", kind: "method", visibility: "private" }],
          dependencies: [],
          forwardingPaths: [],
        },
      ],
    },
  ];
  const after: ArchitectureFileFact[] = [
    {
      path: "src/runner.ts",
      imports: [],
      references: [],
      types: [
        {
          name: "Runner",
          members: [{ name: "run", kind: "method", visibility: "private" }],
          dependencies: [],
          forwardingPaths: [],
        },
      ],
    },
  ];
  const map = parseResponsibilityMap(
    '{"targetScope":["src/service.ts","src/runner.ts"],"responsibilities":[{"name":"run","currentOwners":["Service"],"consumers":[],"dependencies":[]}],"desired":{"ownership":[{"responsibility":"run","owner":"Runner"}],"boundaries":[]}}',
  );
  const progress = evaluateResponsibilityMap(map, before, after, parseQualityConfig("{}"));
  const result = decideQuality({
    snapshot: {
      baseIdentity: "base",
      targetIdentity: "index",
      changes: [
        {
          kind: "modify",
          before: { path: "src/service.ts", content: "before" },
          after: { path: "src/runner.ts", content: "after" },
        },
      ],
    },
    config: parseQualityConfig("{}"),
    beforeFiles: before,
    afterFiles: after,
    scanner: { findings: [] },
    refactorMap: map,
  });
  assert.equal(progress.hasDeclaredOutcomeProgress, true);
  assert.equal(progress.indicators.ownership.status, "improved");
  assert.equal(result.verdict, "PASS");
});

test("rejects incomplete, outcome-free, and unknown responsibility map fields", () => {
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[],"desired":{"ownership":[],"boundaries":[]}}',
      ),
    /responsibilities/,
  );
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[{"name":"run","currentOwners":["Service"],"consumers":[],"dependencies":[]}],"desired":{"ownership":[],"boundaries":[]}}',
      ),
    /outcome/,
  );
  assert.throws(
    () =>
      parseResponsibilityMap(
        '{"targetScope":["src/a.ts"],"responsibilities":[{"name":"run","currentOwners":["Service"],"consumers":[],"dependencies":[]}],"desired":{"ownership":[],"boundaries":[]},"extra":true}',
      ),
    /not supported/,
  );
});
