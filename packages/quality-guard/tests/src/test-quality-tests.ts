import type { Evidence } from "../../src/test-quality/types.js";

export const signalTests = [
  {
    id: "ts.behavior.test",
    path: "tests/service.test.ts",
    language: "typescript",
    covers: ["ts.behavior", "ts.boundary"],
    status: "passed",
    durationMs: 5,
    testClass: "unit",
  },
  {
    id: "py.behavior.test",
    path: "tests/parser_test.py",
    language: "py",
    covers: ["py.behavior"],
    status: "passed",
    durationMs: 4,
    testClass: "unit",
  },
  {
    id: "ts.ambiguous.test",
    path: "tests/ambiguous.test.ts",
    language: "ts",
    covers: [],
    status: "skipped",
    skipReason: {
      kind: "ambiguity",
      detail: "empty input contract is undecided",
    },
    testClass: "unit",
  },
  {
    id: "ts.failure.one",
    path: "tests/service.test.ts",
    language: "ts",
    covers: ["ts.behavior"],
    status: "failed",
    durationMs: 150,
    testClass: "unit",
  },
  {
    id: "ts.failure.two",
    path: "tests/service.test.ts",
    language: "ts",
    covers: ["ts.behavior"],
    status: "failed",
    durationMs: 8,
    testClass: "unit",
  },
] satisfies Evidence["tests"];
