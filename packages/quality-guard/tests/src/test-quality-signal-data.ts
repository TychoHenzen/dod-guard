import type { Evidence } from "../../src/test-quality/types.js";

export const signalCoverage = {
  provider: "mixed",
  observations: [
    {
      sourcePath: "src/service.ts",
      uncoveredBehaviorIds: ["ts.behavior"],
      statements: { covered: 8, total: 10 },
      branches: { covered: 2, total: 4 },
    },
    {
      sourcePath: "src/parser.py",
      statements: { covered: 4, total: 4 },
    },
  ],
} satisfies NonNullable<Evidence["coverage"]>;

export const signalBugs = [
  { id: "BUG-17", sourcePath: "src/service.ts", behaviorIds: ["ts.bug"] },
] satisfies NonNullable<Evidence["bugs"]>;

export const signalFailures = [
  {
    testId: "ts.failure.one",
    sourcePath: "src/service.ts",
    behaviorId: "ts.behavior",
    signature: "unexpected-null",
    inputClass: "empty",
  },
  {
    testId: "ts.failure.two",
    sourcePath: "src/service.ts",
    behaviorId: "ts.behavior",
    signature: "unexpected-null",
    inputClass: "empty",
  },
] satisfies NonNullable<Evidence["failures"]>;

export const signalTiming = {
  environment: "ci-linux-node22",
  budgets: [{ testClass: "unit", maxDurationMs: 100 }],
} satisfies NonNullable<Evidence["timing"]>;
