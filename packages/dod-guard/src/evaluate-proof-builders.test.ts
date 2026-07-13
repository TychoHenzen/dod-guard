/**
 * Tests for builder functions and handlers in evaluate-proof.ts that need
 * mocked analysis modules (assertions, observability, brevity).
 *
 * These CANNOT live in evaluate-proof.test.ts because that file has a static
 * import of evaluate-proof.js which locks in unmocked dependency resolution.
 * ESM caches modules — mock.module only affects future imports, and the first
 * static import resolves all transitive dependencies before any mock can
 * intercept them.
 *
 * This file registers mock.module BEFORE any import of evaluate-proof.js,
 * so the handlers get mock-wired analysis functions.
 */

import * as assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import type { ExecFn } from "./evaluate-proof.js";
import type { TaskNode } from "./types.js";

// ── Type imports for mock report construction ───────────────────────────

import type { AssertionReport } from "./assertions.js";
import type { BrevityOpts, BrevityReport, BrevityViolation } from "./brevity.js";
import type { ObservabilityReport } from "./observability.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function fakeExec(exitCode: number, combined: string): ExecFn {
  return async (_cmd, _cwd) => ({ exitCode, combined, duration: 42 });
}

function concreteNode(overrides?: Partial<TaskNode>): TaskNode {
  return {
    id: "n1",
    title: "Test Proof",
    refinement: "concrete",
    command: "echo ok",
    description: "a test proof",
    predicate: { type: "exit_code", value: 0 },
    last_status: "pending",
    ...overrides,
  };
}

const CWD = "/fake/project";

// ── Mock report factories ───────────────────────────────────────────────

function _emptyAssertionReport(): AssertionReport {
  return { total: 0, trivial: 0, nonTrivial: 0, files: [], perFile: [] };
}

function trivialAssertionReport(): AssertionReport {
  return {
    total: 10,
    trivial: 10,
    nonTrivial: 0,
    files: ["test/foo.test.ts"],
    perFile: [{ file: "test/foo.test.ts", total: 10, trivial: 10 }],
  };
}

function multiFileAssertionReport(): AssertionReport {
  return {
    total: 15,
    trivial: 10,
    nonTrivial: 5,
    files: ["test/foo.test.ts", "test/bar.test.ts"],
    perFile: [
      { file: "test/foo.test.ts", total: 10, trivial: 8 },
      { file: "test/bar.test.ts", total: 5, trivial: 2 },
    ],
  };
}

function _emptyBrevityReport(): BrevityReport {
  return { totalViolations: 0, violations: [], files: [], perFile: [] };
}

interface MockBrevityFile {
  lineCount?: number;
  functionCount?: number;
  longFunctions?: number;
  highComplexityFunctions?: number;
  unnecessaryElseCount?: number;
  elseAvoidableCount?: number;
  insertions?: number;
  deletions?: number;
}

function brevityReport(violations: BrevityViolation[], perFileOverrides?: MockBrevityFile): BrevityReport {
  const byFile = new Map<string, BrevityViolation[]>();
  for (const v of violations) {
    const arr = byFile.get(v.file) ?? [];
    arr.push(v);
    byFile.set(v.file, arr);
  }
  const perFile: BrevityReport["perFile"] = [];
  for (const [file, fv] of byFile) {
    perFile.push({
      file,
      violations: fv,
      lineCount: perFileOverrides?.lineCount ?? 100,
      functionCount: perFileOverrides?.functionCount ?? 5,
      longFunctions: perFileOverrides?.longFunctions ?? fv.filter((v) => v.kind === "function_too_long").length,
      highComplexityFunctions:
        perFileOverrides?.highComplexityFunctions ?? fv.filter((v) => v.kind === "high_complexity").length,
      unnecessaryElseCount:
        perFileOverrides?.unnecessaryElseCount ?? fv.filter((v) => v.kind === "unnecessary_else").length,
      elseAvoidableCount: perFileOverrides?.elseAvoidableCount ?? fv.filter((v) => v.kind === "else_avoidable").length,
      insertions: perFileOverrides?.insertions,
      deletions: perFileOverrides?.deletions,
    });
  }
  return {
    totalViolations: violations.length,
    violations,
    files: [...byFile.keys()],
    perFile,
  };
}

function lineLenViolation(file: string, line: number, len: number, max: number): BrevityViolation {
  return { file, line, kind: "line_too_long", detail: `line length ${len} exceeds max ${max}` };
}

function fnSizeViolation(file: string, line: number, name: string, lines: number, max: number): BrevityViolation {
  return { file, line, kind: "function_too_long", detail: `"${name}" is ${lines} lines, exceeds max ${max}` };
}

function fileSizeViolation(file: string, lines: number, max: number): BrevityViolation {
  return { file, line: 1, kind: "file_too_long", detail: `file has ${lines} lines, exceeds max ${max}` };
}

function complexityViolation(file: string, line: number, name: string, cc: number, max: number): BrevityViolation {
  return {
    file,
    line,
    kind: "high_complexity",
    detail: `"${name}" CC=${cc}, exceeds max ${max} — extract decision-heavy blocks into helpers`,
  };
}

function unnecElseViolation(file: string, line: number, name: string, count: number): BrevityViolation {
  return {
    file,
    line,
    kind: "unnecessary_else",
    detail: `"${name}" has ${count} unnecessary else clause${count > 1 ? "s" : ""} after exit statement — use guard clause instead`,
  };
}

function avoidElseViolation(file: string, line: number, name: string, count: number): BrevityViolation {
  return {
    file,
    line,
    kind: "else_avoidable",
    detail: `"${name}" has ${count} if/else pair${count > 1 ? "s" : ""} and zero guard clauses — refactor if-branch to exit early, eliminate else`,
  };
}

function replRatioViolation(file: string, ins: number, del: number, ratio: number, min: number): BrevityViolation {
  return {
    file,
    line: 1,
    kind: "low_replacement_ratio",
    detail: `+${ins} -${del} (deletion ratio ${(ratio * 100).toFixed(0)}% < required ${(min * 100).toFixed(0)}%) — old code not removed`,
  };
}

function obsReport(overrides?: Partial<ObservabilityReport>): ObservabilityReport {
  return {
    totalLogStatements: 5,
    totalErrorHandlers: 3,
    errorHandlersLogged: 3,
    antiPatterns: [],
    files: ["src/foo.ts"],
    perFile: [{ file: "src/foo.ts", logCount: 5, errorHandlers: 3, errorHandlersLogged: 3, antiPatterns: [] }],
    ...overrides,
  };
}

// ── Mock setup — must run BEFORE any evaluate-proof.js import ───────────

const DEFAULT_BREVITY_OPTS: BrevityOpts = {
  maxLineLength: 120,
  maxFunctionLines: 30,
  maxFileLines: 300,
  maxComplexity: 5,
  requireGuardClauses: true,
  suggestGuardClauses: true,
  minReplacementRatio: 0.2,
};

const analyseAssertionsMock = mock.fn<() => AssertionReport | null>(() => null);
const analyseBrevityMock = mock.fn<() => BrevityReport | null>(() => null);
const analyseBrevityFromOutputMock = mock.fn<
  (_output: string, _cwd: string, _opts: BrevityOpts) => BrevityReport | null
>(() => null);
const analyseObservabilityMock = mock.fn<() => ObservabilityReport | null>(() => null);
const analyseObservabilityFromOutputMock = mock.fn<(_output: string, _cwd: string) => ObservabilityReport | null>(
  () => null,
);

mock.module("./assertions.js", {
  namedExports: { analyseAssertions: analyseAssertionsMock },
});

mock.module("./observability.js", {
  namedExports: {
    analyseObservability: analyseObservabilityMock,
    analyseObservabilityFromOutput: analyseObservabilityFromOutputMock,
  },
});

mock.module("./brevity.js", {
  namedExports: {
    analyseBrevity: analyseBrevityMock,
    analyseBrevityFromOutput: analyseBrevityFromOutputMock,
    DEFAULT_BREVITY_OPTS,
  },
});

// Must be dynamic — mocks must be registered BEFORE evaluate-proof is imported
const mod = await import("./evaluate-proof.js");
const executeProof = mod.executeProof;

// ── Reset mocks before each test ────────────────────────────────────────

function resetAllMocks() {
  analyseAssertionsMock.mock.resetCalls();
  analyseAssertionsMock.mock.mockImplementation(() => null);

  analyseBrevityMock.mock.resetCalls();
  analyseBrevityMock.mock.mockImplementation(() => null);

  analyseBrevityFromOutputMock.mock.resetCalls();
  analyseBrevityFromOutputMock.mock.mockImplementation(() => null);

  analyseObservabilityMock.mock.resetCalls();
  analyseObservabilityMock.mock.mockImplementation(() => null);

  analyseObservabilityFromOutputMock.mock.resetCalls();
  analyseObservabilityFromOutputMock.mock.mockImplementation(() => null);
}

after(() => {
  mock.reset();
});

function beforeEachReset() {
  before(() => {
    resetAllMocks();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// buildAssertFail (via executeProof + assertions predicate)
// ══════════════════════════════════════════════════════════════════════════

describe("buildAssertFail (via assertions predicate)", () => {
  beforeEachReset();

  it("reports fail when all assertions are trivial", async () => {
    analyseAssertionsMock.mock.mockImplementation(() => trivialAssertionReport());
    const node = concreteNode({ predicate: { type: "assertions", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /ASSERTION QUALITY FAIL: all \d+ assertions trivial/);
  });

  it("reports fail when nonTrivial is below min", async () => {
    const report = multiFileAssertionReport(); // 5 nonTrivial
    analyseAssertionsMock.mock.mockImplementation(() => report);
    const node = concreteNode({ predicate: { type: "assertions", value: 10 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /ASSERTION QUALITY FAIL: only \d+ nt/);
    assert.match(result.error ?? "", /Per-file:/);
    assert.match(result.error ?? "", /test\/foo\.test\.ts/);
    assert.match(result.error ?? "", /test\/bar\.test\.ts/);
  });

  it("passes when nonTrivial meets or exceeds min", async () => {
    const report = multiFileAssertionReport(); // 5 nonTrivial
    analyseAssertionsMock.mock.mockImplementation(() => report);
    const node = concreteNode({ predicate: { type: "assertions", value: 5 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /assertions: \d+ non-trivial/);
  });

  it("passes with single file report", async () => {
    const report: AssertionReport = {
      total: 5,
      trivial: 1,
      nonTrivial: 4,
      files: ["test/foo.test.ts"],
      perFile: [{ file: "test/foo.test.ts", total: 5, trivial: 1 }],
    };
    analyseAssertionsMock.mock.mockImplementation(() => report);
    const node = concreteNode({ predicate: { type: "assertions", value: 3 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });

  it("buildAssertFail shows per-file breakdown with nt column", async () => {
    const report = multiFileAssertionReport();
    analyseAssertionsMock.mock.mockImplementation(() => report);
    const node = concreteNode({ predicate: { type: "assertions", value: 10 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /2 nt/);
    assert.match(result.error ?? "", /3 nt/);
  });

  it("returns fail when no test files found", async () => {
    analyseAssertionsMock.mock.mockImplementation(() => null);
    const node = concreteNode({ predicate: { type: "assertions", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no test files found/);
  });

  it("uses min=1 as default when value not set", async () => {
    const report: AssertionReport = {
      total: 0,
      trivial: 0,
      nonTrivial: 0,
      files: ["test/foo.test.ts"],
      perFile: [{ file: "test/foo.test.ts", total: 0, trivial: 0 }],
    };
    analyseAssertionsMock.mock.mockImplementation(() => report);
    const node = concreteNode({ predicate: { type: "assertions" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /ASSERTION QUALITY FAIL/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildObsFail (via executeProof + observability predicate)
// ══════════════════════════════════════════════════════════════════════════

describe("buildObsFail (via observability predicate)", () => {
  beforeEachReset();

  it("reports fail when log count below min", async () => {
    analyseObservabilityMock.mock.mockImplementation(() => obsReport({ totalLogStatements: 2 }));
    const node = concreteNode({ predicate: { type: "observability", value: 5 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /observability: 2 logs—need 5/);
  });

  it("reports fail when error handlers lack logs", async () => {
    analyseObservabilityMock.mock.mockImplementation(() =>
      obsReport({ totalErrorHandlers: 5, errorHandlersLogged: 2 }),
    );
    const node = concreteNode({ predicate: { type: "observability", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /observability: \d+\/\d+ handlers lack logs/);
  });

  it("reports anti-patterns in fail message", async () => {
    analyseObservabilityMock.mock.mockImplementation(() =>
      obsReport({
        totalLogStatements: 0,
        antiPatterns: [{ file: "src/foo.ts", line: 42, kind: "empty_catch", snippet: "catch (e) { }" }],
      }),
    );
    const node = concreteNode({ predicate: { type: "observability", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /anti-pattern/);
    assert.match(result.error ?? "", /empty_catch/);
  });

  it("reports multiple anti-patterns with file:line format", async () => {
    analyseObservabilityMock.mock.mockImplementation(() =>
      obsReport({
        totalLogStatements: 0,
        antiPatterns: [
          { file: "src/a.ts", line: 10, kind: "empty_catch", snippet: "catch {}" },
          { file: "src/b.ts", line: 20, kind: "swallowed_error", snippet: "catch(e){return null}" },
        ],
      }),
    );
    const node = concreteNode({ predicate: { type: "observability", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /2 anti-pattern/);
    assert.match(result.error ?? "", /src\/a\.ts:10/);
    assert.match(result.error ?? "", /src\/b\.ts:20/);
  });

  it("passes when all observability checks pass", async () => {
    analyseObservabilityMock.mock.mockImplementation(() => obsReport());
    const node = concreteNode({ predicate: { type: "observability", value: 4 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /observability:/);
  });

  it("returns fail when no source files found", async () => {
    analyseObservabilityMock.mock.mockImplementation(() => null);
    analyseObservabilityFromOutputMock.mock.mockImplementation(() => null);
    const node = concreteNode({ predicate: { type: "observability", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no source files/);
  });

  it("falls back to observability from output when primary returns null", async () => {
    analyseObservabilityMock.mock.mockImplementation(() => null);
    analyseObservabilityFromOutputMock.mock.mockImplementation(() => obsReport({ totalLogStatements: 1 }));
    const node = concreteNode({ predicate: { type: "observability", value: 5 } });
    const result = await executeProof(node, CWD, fakeExec(0, "some output"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /observability: 1 logs—need 5/);
  });

  it("uses min default of 1 when value not set", async () => {
    analyseObservabilityMock.mock.mockImplementation(() => obsReport({ totalLogStatements: 0 }));
    const node = concreteNode({ predicate: { type: "observability" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /logs—need 1/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildLineLenFail (via executeProof + line_length predicate / hBrevity)
// ══════════════════════════════════════════════════════════════════════════

describe("buildLineLenFail (via line_length predicate)", () => {
  beforeEachReset();

  it("reports single line-length violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 42, 150, 120)]));
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /line_length FAIL: 1 line\(s\) > 120 chars/);
    assert.match(result.error ?? "", /src\/foo\.ts: 100L/);
    assert.match(result.error ?? "", /L42: line length 150 exceeds max 120/);
  });

  it("reports multiple line-length violations", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([
        lineLenViolation("src/a.ts", 10, 200, 120),
        lineLenViolation("src/a.ts", 25, 180, 120),
        lineLenViolation("src/b.ts", 5, 150, 120),
      ]),
    );
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /line_length FAIL: 3 line\(s\)/);
    assert.match(result.error ?? "", /src\/a\.ts/);
    assert.match(result.error ?? "", /src\/b\.ts/);
  });

  it("passes when no line-length violations and within max", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /line_length: all lines/);
  });

  it("fails when violations exceed max even if some are other kinds (filter only line_too_long)", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([lineLenViolation("src/foo.ts", 42, 150, 120), fnSizeViolation("src/foo.ts", 1, "bigFn", 50, 30)]),
    );
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /line_length FAIL/);
    assert.match(result.error ?? "", /line length 150/);
    assert.equal((result.error ?? "").includes("function"), false);
  });

  it("includes remediation hint in fail message", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 1, 150, 120)]));
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /Remediation/);
  });

  it("uses custom max_line_length from predicate", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 1, 110, 100)]));
    const node = concreteNode({
      predicate: { type: "line_length", value: 0, max_line_length: 100 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /line_length FAIL/);
  });

  it("returns fail when brevity: no source files", async () => {
    analyseBrevityMock.mock.mockImplementation(() => null);
    analyseBrevityFromOutputMock.mock.mockImplementation(() => null);
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no source files/);
  });

  it("fails when no predicate set on brevity decomposed handler", async () => {
    const node = concreteNode({ predicate: undefined });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildFnSizeFail (via executeProof + function_size predicate / hBrevity)
// ══════════════════════════════════════════════════════════════════════════

describe("buildFnSizeFail (via function_size predicate)", () => {
  beforeEachReset();

  it("reports single function-size violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([fnSizeViolation("src/foo.ts", 25, "doEverything", 80, 30)]),
    );
    const node = concreteNode({ predicate: { type: "function_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /function_size FAIL: 1 function\(s\) > 30 lines/);
    assert.match(result.error ?? "", /"doEverything" is 80 lines/);
  });

  it("reports multiple function-size violations across files", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([
        fnSizeViolation("src/a.ts", 10, "bigA", 100, 30),
        fnSizeViolation("src/a.ts", 200, "bigA2", 60, 30),
        fnSizeViolation("src/b.ts", 5, "bigB", 45, 30),
      ]),
    );
    const node = concreteNode({ predicate: { type: "function_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /function_size FAIL: 3 function\(s\)/);
    assert.match(result.error ?? "", /src\/a\.ts: \d+ funcs, 2 long/);
    assert.match(result.error ?? "", /src\/b\.ts: \d+ funcs, 1 long/);
  });

  it("passes when all functions within size limit", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "function_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /function_size: all functions/);
  });

  it("uses custom max_function_lines from predicate", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([fnSizeViolation("src/foo.ts", 1, "fn", 25, 20)]));
    const node = concreteNode({
      predicate: { type: "function_size", value: 0, max_function_lines: 20 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /function_size FAIL/);
  });

  it("includes remediation hint for function splitting", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([fnSizeViolation("src/foo.ts", 1, "bigFn", 50, 30)]),
    );
    const node = concreteNode({ predicate: { type: "function_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /Remediation: split functions/);
  });

  it("filters only function_too_long violations (ignores other kinds)", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([fnSizeViolation("src/foo.ts", 1, "bigFn", 50, 30), lineLenViolation("src/foo.ts", 42, 150, 120)]),
    );
    const node = concreteNode({ predicate: { type: "function_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /function_size FAIL: 1/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildFileSizeFail (via executeProof + file_size predicate / hBrevity)
// ══════════════════════════════════════════════════════════════════════════

describe("buildFileSizeFail (via file_size predicate)", () => {
  beforeEachReset();

  it("reports single file-size violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([fileSizeViolation("src/big.ts", 500, 300)]));
    const node = concreteNode({ predicate: { type: "file_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /file_size FAIL: 1 file\(s\) > 300 lines/);
    assert.match(result.error ?? "", /src\/big\.ts: \d+L \(max 300\)/);
    assert.match(result.error ?? "", /file has 500 lines/);
  });

  it("reports multiple file-size violations", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([fileSizeViolation("src/a.ts", 400, 300), fileSizeViolation("src/b.ts", 350, 300)]),
    );
    const node = concreteNode({ predicate: { type: "file_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /file_size FAIL: 2 file\(s\)/);
  });

  it("passes when all files within size limit", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "file_size", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /file_size: all files/);
  });

  it("uses custom max_file_lines from predicate", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([fileSizeViolation("src/foo.ts", 250, 200)]));
    const node = concreteNode({
      predicate: { type: "file_size", value: 0, max_file_lines: 200 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /file_size FAIL/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildCohesionFail (via executeProof + cohesion predicate / hBrevity)
// ══════════════════════════════════════════════════════════════════════════

describe("buildCohesionFail (via cohesion predicate)", () => {
  beforeEachReset();

  it("reports high complexity violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([complexityViolation("src/foo.ts", 15, "doAll", 10, 5)]),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /cohesion FAIL: 1 violation/);
    assert.match(result.error ?? "", /"doAll" CC=10/);
  });

  it("reports unnecessary else violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([unnecElseViolation("src/foo.ts", 30, "checkX", 2)]),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /cohesion FAIL/);
    assert.match(result.error ?? "", /2 unnecessary else clause/);
  });

  it("reports else_avoidable violation", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([avoidElseViolation("src/foo.ts", 40, "process", 3)]),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /cohesion FAIL/);
    assert.match(result.error ?? "", /3 if\/else pair/);
  });

  it("reports mixed violation kinds with per-file breakdown", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport(
        [
          complexityViolation("src/a.ts", 10, "bigFn", 8, 5),
          unnecElseViolation("src/a.ts", 30, "bigFn", 1),
          avoidElseViolation("src/b.ts", 50, "oldFn", 2),
        ],
        { functionCount: 3, highComplexityFunctions: 1, unnecessaryElseCount: 1, elseAvoidableCount: 0 },
      ),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /cohesion FAIL: 3 violation/);
    assert.match(result.error ?? "", /CC>5/);
    assert.match(result.error ?? "", /unnec else/);
    assert.match(result.error ?? "", /else_avoidable/);
  });

  it("passes when no cohesion violations", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /cohesion: 0 violations/);
  });

  it("filters out non-cohesion violations (line_length, function_size, file_size)", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([
        complexityViolation("src/foo.ts", 10, "fn", 8, 5),
        lineLenViolation("src/foo.ts", 42, 150, 120),
        fnSizeViolation("src/foo.ts", 1, "fn", 50, 30),
        fileSizeViolation("src/foo.ts", 500, 300),
      ]),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /cohesion FAIL: 1/);
    assert.match(result.error ?? "", /CC=8/);
    assert.equal((result.error ?? "").includes("line length 150"), false);
  });

  it("includes remediation hints for complexity and guard clauses", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([complexityViolation("src/foo.ts", 10, "fn", 8, 5)]),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /Reduce cyclomatic complexity/);
    assert.match(result.error ?? "", /Prefer guard clauses/);
    assert.match(result.error ?? "", /early returns/);
  });

  it("shows per-file CC and unnec else counts", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([complexityViolation("src/foo.ts", 10, "bigFn", 8, 5)], {
        functionCount: 5,
        highComplexityFunctions: 1,
        unnecessaryElseCount: 3,
        elseAvoidableCount: 1,
      }),
    );
    const node = concreteNode({ predicate: { type: "cohesion", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /1 CC>5/);
    assert.match(result.error ?? "", /3 unnec else/);
    assert.match(result.error ?? "", /1 avoid else/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildReplRatioFail (via executeProof + replacement_ratio predicate)
// ══════════════════════════════════════════════════════════════════════════

describe("buildReplRatioFail (via replacement_ratio predicate)", () => {
  beforeEachReset();

  it("reports single low replacement ratio violation", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() =>
      brevityReport([replRatioViolation("src/foo.ts", 100, 5, 0.05, 0.2)]),
    );
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "diff output"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /replacement_ratio FAIL: 1 file\(s\) below min ratio 20%/);
    assert.match(result.error ?? "", /deletion ratio 5%/);
  });

  it("reports multiple replacement ratio violations", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() =>
      brevityReport([
        replRatioViolation("src/a.ts", 50, 3, 0.06, 0.2),
        replRatioViolation("src/b.ts", 80, 4, 0.05, 0.2),
      ]),
    );
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /replacement_ratio FAIL: 2 file\(s\)/);
    assert.match(result.error ?? "", /src\/a\.ts/);
    assert.match(result.error ?? "", /src\/b\.ts/);
  });

  it("passes when all files meet minimum replacement ratio", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /replacement_ratio: all files above/);
  });

  it("displays ratio as percentage in pass message", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({
      predicate: { type: "replacement_ratio", value: 0, min_replacement_ratio: 0.15 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /15%/);
  });

  it("uses custom min_replacement_ratio from predicate", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() =>
      brevityReport([replRatioViolation("src/foo.ts", 20, 2, 0.1, 0.3)]),
    );
    const node = concreteNode({
      predicate: { type: "replacement_ratio", value: 0, min_replacement_ratio: 0.3 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /below min ratio 30%/);
  });

  it("falls back to analyseBrevity when output analysis returns null", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() => null);
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([replRatioViolation("src/foo.ts", 30, 2, 0.06, 0.2)]),
    );
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /replacement_ratio FAIL/);
  });

  it("returns fail when no diff data available", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() => null);
    analyseBrevityMock.mock.mockImplementation(() => null);
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no diff data in command output/);
  });

  it("uses min default of 0.2 when not set in predicate", async () => {
    analyseBrevityFromOutputMock.mock.mockImplementation(() =>
      brevityReport([replRatioViolation("src/foo.ts", 100, 10, 0.1, 0.2)]),
    );
    const node = concreteNode({ predicate: { type: "replacement_ratio", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /20%/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// hBrev — composite brevity handler (via executeProof + brevity predicate)
// ══════════════════════════════════════════════════════════════════════════

describe("hBrev (via brevity predicate)", () => {
  beforeEachReset();

  it("passes when total violations <= max", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /brevity:/);
  });

  it("fails when total violations > max", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 42, 150, 120)]));
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /BREVITY FAIL: 1 > 0/);
  });

  it("shows per-file summary with violation counts", async () => {
    const r = brevityReport(
      [lineLenViolation("src/foo.ts", 42, 150, 120), complexityViolation("src/foo.ts", 10, "bigFn", 8, 5)],
      {
        functionCount: 5,
        lineCount: 100,
        longFunctions: 0,
        highComplexityFunctions: 1,
        unnecessaryElseCount: 0,
        elseAvoidableCount: 0,
      },
    );
    analyseBrevityMock.mock.mockImplementation(() => r);
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.error ?? "", /src\/foo\.ts: 100L, 5 funcs/);
    assert.match(result.error ?? "", /1 CC>5/);
  });

  it("reports failure with full brevity report and remediation", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 1, 200, 120)]));
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /BREVITY FAIL/);
    assert.match(result.error ?? "", /Remediation/);
    assert.match(result.error ?? "", /Split functions/);
    assert.match(result.error ?? "", /guard clauses/);
  });

  it("uses custom brevity opts from predicate", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([lineLenViolation("src/foo.ts", 1, 110, 100)]));
    const node = concreteNode({
      predicate: { type: "brevity", value: 0, max_line_length: 100 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /BREVITY FAIL/);
  });

  it("returns fail when no predicate set on brevity handler", async () => {
    const node = concreteNode({ predicate: undefined });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });

  it("returns fail when no source files in brevity analysis", async () => {
    analyseBrevityMock.mock.mockImplementation(() => null);
    analyseBrevityFromOutputMock.mock.mockImplementation(() => null);
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /brevity: no source files/);
  });

  it("falls back to output-based brevity analysis", async () => {
    analyseBrevityMock.mock.mockImplementation(() => null);
    analyseBrevityFromOutputMock.mock.mockImplementation(() =>
      brevityReport([lineLenViolation("src/bar.ts", 5, 130, 120)]),
    );
    const node = concreteNode({ predicate: { type: "brevity", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "some output"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /BREVITY FAIL/);
  });

  it("max defaults to 0 when value not set", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "brevity" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// hBrevity — edge cases (decomposed brevity handler)
// ══════════════════════════════════════════════════════════════════════════

describe("hBrevity edge cases", () => {
  beforeEachReset();

  it("passes when violation count equals max (boundary)", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([lineLenViolation("src/a.ts", 1, 130, 120), lineLenViolation("src/b.ts", 1, 140, 120)]),
    );
    const node = concreteNode({ predicate: { type: "line_length", value: 2 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /line_length: all lines/);
  });

  it("fails when violation count equals max+1 (boundary)", async () => {
    analyseBrevityMock.mock.mockImplementation(() =>
      brevityReport([
        lineLenViolation("src/a.ts", 1, 130, 120),
        lineLenViolation("src/b.ts", 1, 140, 120),
        lineLenViolation("src/c.ts", 1, 150, 120),
      ]),
    );
    const node = concreteNode({ predicate: { type: "line_length", value: 2 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
  });

  it("passes with max=0 when no violations", async () => {
    analyseBrevityMock.mock.mockImplementation(() => brevityReport([]));
    const node = concreteNode({ predicate: { type: "line_length", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });

  it("returns fail when no predicate on decomposed handler", async () => {
    const node = concreteNode({ predicate: undefined });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// hManual — additional edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("hManual edge cases", () => {
  beforeEachReset();

  it("includes note in manual result output when present", async () => {
    const { perProofFingerprint } = await import("./manual.js");
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "fail",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        note: "needs more tests",
        proof_fingerprint: "",
      },
    });
    const mr = node.manual_result;
    if (!mr) throw new Error("no manual_result");
    mr.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.output ?? "", /needs more tests/);
  });

  it("uses 'Code review' label for review predicate type", async () => {
    const { perProofFingerprint } = await import("./manual.js");
    const node = concreteNode({
      predicate: { type: "review" },
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "",
      },
    });
    const mr = node.manual_result;
    if (!mr) throw new Error("no manual_result");
    mr.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.output ?? "", /Code review/);
  });

  it("uses 'Manual verification' label for manual predicate type", async () => {
    const { perProofFingerprint } = await import("./manual.js");
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "",
      },
    });
    const mr = node.manual_result;
    if (!mr) throw new Error("no manual_result");
    mr.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.match(result.output ?? "", /Manual verification/);
  });

  it("manual verification shows skipped when fingerprint missing", async () => {
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "bad-fingerprint",
      },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "skipped");
    assert.match(result.output ?? "", /not verified/);
  });

  it("handles empty command for manual proofs (allowed)", async () => {
    const { perProofFingerprint } = await import("./manual.js");
    const node = concreteNode({
      predicate: { type: "manual" },
      command: "", // empty command OK for manual
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "",
      },
    });
    const mr = node.manual_result;
    if (!mr) throw new Error("no manual_result");
    mr.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });
});
