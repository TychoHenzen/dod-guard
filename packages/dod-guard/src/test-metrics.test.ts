import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import type { TestFileMetrics } from "./test-metrics.js";
import { analyseTestMetrics, scoreFromMetrics } from "./test-metrics.js";

// ── Helpers ─────────────────────────────────────────────────────────

function tmpDir(): string {
  return path.join(os.tmpdir(), `dod-test-metrics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function writeFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  writeFileSync(p, content, "utf-8");
  return p;
}

function mkdir(dir: string, ...parts: string[]): string {
  const p = path.join(dir, ...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

// ── Minimal metrics fixture ──────────────────────────────────────────

const BASE_METRICS_DEFAULTS: TestFileMetrics = {
  file: "src/foo.test.ts",
  lineCount: 50,
  testFunctions: [
    { name: "should calculate total", line: 10, isSkipped: false },
    { name: "should handle zero", line: 25, isSkipped: false },
    { name: "should throw on negative", line: 40, isSkipped: false },
  ],
  testFunctionCount: 3,
  totalAssertions: 9,
  trivialAssertions: 0,
  truthinessAssertions: 1,
  specificAssertions: 8,
  zeroAssertionFunctions: 0,
  assertionsWithMessage: 5,
  assertionsWithoutMessage: 4,
  hasRealTime: false,
  hasUnseededRandom: false,
  hasSleep: false,
  hasRealFilesystem: false,
  hasRealNetwork: false,
  hasRealDatabase: false,
  hasSharedMutableState: false,
  hasSetupTeardown: true,
  moduleMutableCount: 1,
  hasTestOnly: false,
  createsOwnFixtures: null,
  genericNames: [],
  hasAaaMarkers: false,
  magicNumberCount: 4,
  multiBehaviorCount: null,
  sleepWaitCount: 0,
  realIoCount: 0,
  errorPathFunctions: 1,
  happyPathFunctions: null,
  edgeCaseFunctions: null,
  frameworkShowsDiff: true,
  hasCustomMatchers: null,
  llm_classifications_needed: ["happy_vs_error_classification", "custom_matchers"],
};

function baseMetrics(overrides: Partial<TestFileMetrics> = {}): TestFileMetrics {
  // Use Object.assign — TypeScript may elide ...spread in object literals
  // when all fields are already satisfied by the explicit return type.
  return Object.assign({}, BASE_METRICS_DEFAULTS, overrides);
}

// ── Score from metrics ───────────────────────────────────────────────

describe("scoreFromMetrics", () => {
  it("scores a healthy test file high", () => {
    const m = baseMetrics();
    const s = scoreFromMetrics(m);
    assert.ok(s.assertion_quality >= 8, `assertion_quality ${s.assertion_quality} >= 8`);
    assert.ok(s.determinism >= 9, `determinism ${s.determinism} >= 9`);
    assert.ok(s.isolation >= 8, `isolation ${s.isolation} >= 8`);
    assert.ok(s.overall >= 7, `overall ${s.overall} >= 7`);
  });

  it("detects trivial assertions (low assertion_triviality)", () => {
    const m = baseMetrics({ totalAssertions: 5, trivialAssertions: 4, specificAssertions: 1 });
    const s = scoreFromMetrics(m);
    assert.ok(s.assertion_triviality < 5, `triviality ${s.assertion_triviality} < 5`);
    assert.ok(s.assertion_quality < 8, `assertion_quality ${s.assertion_quality} < 8`);
  });

  it("penalizes determinism violations", () => {
    const m = baseMetrics({
      hasRealTime: true,
      hasUnseededRandom: true,
      hasSleep: true,
      hasRealFilesystem: true,
      hasRealNetwork: true,
      hasRealDatabase: true,
    });
    const s = scoreFromMetrics(m);
    assert.ok(s.determinism < 5, `determinism ${s.determinism} < 5 with 6 violations`);
  });

  it("penalizes shared mutable state (half point)", () => {
    const clean = scoreFromMetrics(baseMetrics());
    const dirty = scoreFromMetrics(baseMetrics({ hasSharedMutableState: true }));
    assert.ok(
      dirty.determinism < clean.determinism,
      `shared mutable should drop determinism: ${dirty.determinism} < ${clean.determinism}`,
    );
  });

  it("scores empty test file", () => {
    const m = baseMetrics({
      testFunctions: [],
      testFunctionCount: 0,
      totalAssertions: 0,
      trivialAssertions: 0,
      truthinessAssertions: 0,
      specificAssertions: 0,
      assertionsWithMessage: 0,
      assertionsWithoutMessage: 0,
      zeroAssertionFunctions: 0,
      errorPathFunctions: 0,
    });
    const s = scoreFromMetrics(m);
    assert.ok(s.assertion_quality <= 6, `empty file assertion_quality ${s.assertion_quality} <= 6`);
    // m.totalAssertions === 0 triggers the fixed branch (was dead code before: ta was clamped to ≥1)
    assert.equal(s.assertion_triviality, 1, "no assertions = triviality rock bottom");
  });

  it("rewards setup/teardown in isolation", () => {
    const withSt = scoreFromMetrics(baseMetrics({ hasSetupTeardown: true, moduleMutableCount: 0 }));
    const withoutSt = scoreFromMetrics(baseMetrics({ hasSetupTeardown: false, moduleMutableCount: 0 }));
    assert.ok(
      withSt.isolation > withoutSt.isolation,
      `setup/teardown should boost isolation: ${withSt.isolation} > ${withoutSt.isolation}`,
    );
  });

  it("penalizes module mutables beyond threshold", () => {
    const low = scoreFromMetrics(baseMetrics({ moduleMutableCount: 1 }));
    const high = scoreFromMetrics(baseMetrics({ moduleMutableCount: 6 }));
    assert.ok(high.isolation < low.isolation, `6 mutables ${high.isolation} < 1 mutable ${low.isolation}`);
  });

  it("penalizes hasTestOnly in isolation", () => {
    const clean = scoreFromMetrics(baseMetrics({ hasTestOnly: false }));
    const dirty = scoreFromMetrics(baseMetrics({ hasTestOnly: true }));
    assert.ok(
      dirty.isolation < clean.isolation,
      `testOnly should drop isolation: ${dirty.isolation} < ${clean.isolation}`,
    );
  });

  it("rewards AAA markers in clarity", () => {
    const withAaa = scoreFromMetrics(baseMetrics({ hasAaaMarkers: true }));
    const withoutAaa = scoreFromMetrics(baseMetrics({ hasAaaMarkers: false }));
    assert.ok(
      withAaa.clarity > withoutAaa.clarity,
      `AAA should boost clarity: ${withAaa.clarity} > ${withoutAaa.clarity}`,
    );
  });

  it("penalizes generic test names in clarity", () => {
    const clean = scoreFromMetrics(baseMetrics({ genericNames: [] }));
    const generics = scoreFromMetrics(
      baseMetrics({
        genericNames: ["test1", "test2", "test the thing"],
      }),
    );
    assert.ok(
      generics.clarity < clean.clarity,
      `generic names should drop clarity: ${generics.clarity} < ${clean.clarity}`,
    );
  });

  it("penalizes magic numbers heavily beyond 1", () => {
    const few = scoreFromMetrics(baseMetrics({ magicNumberCount: 1 }));
    const many = scoreFromMetrics(baseMetrics({ magicNumberCount: 8 }));
    assert.ok(many.clarity < few.clarity, `8 magic numbers ${many.clarity} < 1 magic number ${few.clarity}`);
  });

  it("penalizes sleep/wait calls in speed", () => {
    const noSleep = scoreFromMetrics(baseMetrics({ sleepWaitCount: 0 }));
    const yesSleep = scoreFromMetrics(baseMetrics({ sleepWaitCount: 3 }));
    assert.ok(yesSleep.speed < noSleep.speed, `sleep should drop speed: ${yesSleep.speed} < ${noSleep.speed}`);
  });

  it("penalizes real I/O in speed", () => {
    const noIo = scoreFromMetrics(baseMetrics({ realIoCount: 0 }));
    const yesIo = scoreFromMetrics(baseMetrics({ realIoCount: 4 }));
    assert.ok(yesIo.speed < noIo.speed, `real I/O should drop speed: ${yesIo.speed} < ${noIo.speed}`);
  });

  it("rewards error path coverage", () => {
    const noErr = scoreFromMetrics(baseMetrics({ errorPathFunctions: 0 }));
    const withErr = scoreFromMetrics(baseMetrics({ errorPathFunctions: 2 }));
    assert.ok(
      withErr.coverage_depth >= noErr.coverage_depth,
      `error paths should help coverage: ${withErr.coverage_depth} >= ${noErr.coverage_depth}`,
    );
  });

  it("all scores within 1-10 range for edge cases", () => {
    // Worst-case: everything bad
    const worst = baseMetrics({
      testFunctions: [{ name: "t", line: 1, isSkipped: false }],
      testFunctionCount: 1,
      totalAssertions: 1,
      trivialAssertions: 1,
      truthinessAssertions: 0,
      specificAssertions: 0,
      zeroAssertionFunctions: 1,
      assertionsWithMessage: 0,
      assertionsWithoutMessage: 1,
      hasRealTime: true,
      hasUnseededRandom: true,
      hasSleep: true,
      hasRealFilesystem: true,
      hasRealNetwork: true,
      hasRealDatabase: true,
      hasSharedMutableState: true,
      hasSetupTeardown: false,
      moduleMutableCount: 10,
      hasTestOnly: true,
      createsOwnFixtures: false,
      genericNames: ["t"],
      hasAaaMarkers: false,
      magicNumberCount: 10,
      multiBehaviorCount: 3,
      sleepWaitCount: 5,
      realIoCount: 5,
      errorPathFunctions: 0,
      frameworkShowsDiff: false,
      hasCustomMatchers: false,
      llm_classifications_needed: [],
    });
    const s = scoreFromMetrics(worst);
    const keys = [
      "assertion_quality",
      "determinism",
      "isolation",
      "clarity",
      "coverage_depth",
      "speed",
      "diagnostics",
      "assertion_triviality",
      "overall",
    ] as const;
    for (const k of keys) {
      assert.ok(s[k] >= 1, `${k}=${s[k]} >= 1`);
      assert.ok(s[k] <= 10, `${k}=${s[k]} <= 10`);
    }
  });

  it("perfect file (all best values) scores near 10", () => {
    const perfect = baseMetrics({
      testFunctions: [
        { name: "calculates total with tax", line: 5, isSkipped: false },
        { name: "handles empty cart gracefully", line: 20, isSkipped: false },
        { name: "throws PaymentError for declined cards", line: 38, isSkipped: false },
        { name: "rounds to nearest cent correctly", line: 55, isSkipped: false },
      ],
      testFunctionCount: 4,
      totalAssertions: 15,
      trivialAssertions: 0,
      truthinessAssertions: 0,
      specificAssertions: 15,
      zeroAssertionFunctions: 0,
      assertionsWithMessage: 10,
      assertionsWithoutMessage: 5,
      hasRealTime: false,
      hasUnseededRandom: false,
      hasSleep: false,
      hasRealFilesystem: false,
      hasRealNetwork: false,
      hasRealDatabase: false,
      hasSharedMutableState: false,
      hasSetupTeardown: true,
      moduleMutableCount: 0,
      hasTestOnly: false,
      createsOwnFixtures: true,
      genericNames: [],
      hasAaaMarkers: true,
      magicNumberCount: 1,
      multiBehaviorCount: 0,
      sleepWaitCount: 0,
      realIoCount: 0,
      errorPathFunctions: 2,
      frameworkShowsDiff: true,
      hasCustomMatchers: true,
      llm_classifications_needed: ["happy_vs_error_classification"],
    });
    const s = scoreFromMetrics(perfect);
    assert.ok(s.overall >= 8, `perfect file overall ${s.overall} >= 8`);
    assert.ok(s.assertion_quality >= 9, `assertion_quality ${s.assertion_quality} >= 9`);
    assert.equal(s.determinism, 10, "determinism should be 10 for clean file");
  });
});

// ── Integration: analyseTestMetrics with real files ──────────────────

describe("analyseTestMetrics", () => {
  let tmp: string;

  before(() => {
    tmp = tmpDir();
    mkdir(tmp);
  });
  after(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  it("returns null for command with no test files", () => {
    assert.equal(analyseTestMetrics("echo hello", tmp), null, "should return null when no test files found");
  });

  it("finds test file referenced by relative path", () => {
    writeFile(
      tmp,
      "calc.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "describe('calc', () => {\n" +
        "  it('adds two numbers', () => {\n" +
        "    assert.equal(1 + 2, 3);\n" +
        "  });\n" +
        "});\n",
    );
    const report = analyseTestMetrics("node calc.test.ts", tmp);
    assert.ok(report !== null, "should find test file");
    assert.ok(report?.files.length > 0, "should have files");
    assert.ok(report?.perFile.length > 0, "should have per-file metrics");
    const m = report.perFile[0];
    assert.ok(m.testFunctionCount >= 1, `expected >= 1 test function, got ${m.testFunctionCount}`);
    assert.ok(m.totalAssertions >= 1, `expected >= 1 assertion, got ${m.totalAssertions}`);
    assert.equal(m.hasRealFilesystem, false, "memory-only test should not flag real filesystem");
  });

  it("detects assertion counts in test file", () => {
    writeFile(
      tmp,
      "math.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('multiplies', () => { assert.equal(2 * 3, 6); });\n" +
        "it('divides', () => { assert.equal(6 / 2, 3); });\n" +
        "it('adds', () => { assert.equal(1 + 2, 3); });\n",
    );
    const report = analyseTestMetrics("vitest math.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.equal(m.testFunctionCount, 3, `expected 3 test functions, got ${m.testFunctionCount}`);
    assert.ok(m.totalAssertions >= 3, `expected >= 3 assertions, got ${m.totalAssertions}`);
  });

  it("detects trivial assertions (constant on constant)", () => {
    writeFile(
      tmp,
      "trivial.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('always passes', () => { assert.equal(1, 1); });\n" +
        "it('asserts true', () => { assert.ok(true); });\n",
    );
    const report = analyseTestMetrics("pnpm test trivial.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.ok(m.trivialAssertions >= 1, `expected >= 1 trivial assertion, got ${m.trivialAssertions}`);
  });

  // NOTE: it.skip() is not detected by JS_TEST_FN — .skip separates "it" from "("
  it("detects test function count correctly", () => {
    writeFile(
      tmp,
      "count.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('first test', () => { assert.equal(1, 1); });\n" +
        "it('second test', () => { assert.equal(1 + 1, 2); });\n",
    );
    const report = analyseTestMetrics("node --test count.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.equal(m.testFunctionCount, 2, "should detect 2 test functions");
    assert.equal(m.testFunctions.length, 2);
  });

  it("detects filesystem patterns via fs. prefix", () => {
    writeFile(
      tmp,
      "fstest.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "const fs = require('fs');\n" +
        "it('reads config', () => {\n" +
        "  const data = fs.readFileSync('/etc/hosts', 'utf-8');\n" +
        "  assert.ok(data.length > 0);\n" +
        "});\n",
    );
    const report = analyseTestMetrics("vitest fstest.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.equal(m.hasRealFilesystem, true, "should detect real filesystem access");
  });

  // detectClarity regex matches bare assert(val, 42) and .toBe(42) only.
  // 1337 not in whitelist (42, 100, 200, 404, 500).
  it("detects magic numbers in bare assert form", () => {
    writeFile(
      tmp,
      "magic.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('magic number', () => {\n" +
        "  assert(result, 1337);\n" +
        "});\n",
    );
    const report = analyseTestMetrics("vitest magic.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.ok(m.magicNumberCount >= 1, `expected magic numbers detected, got ${m.magicNumberCount}`);
  });

  it("sets hasAaaMarkers to true when AAA comments present", () => {
    writeFile(
      tmp,
      "aaa.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('processes order', () => {\n" +
        "  // Arrange\n" +
        "  const order = { items: 3 };\n" +
        "  // Act\n" +
        "  const result = process(order);\n" +
        "  // Assert\n" +
        "  assert.equal(result, true);\n" +
        "});\n",
    );
    const report = analyseTestMetrics("node aaa.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.equal(m.hasAaaMarkers, true, "should detect AAA comment markers");
  });

  it("detects generic test names", () => {
    writeFile(
      tmp,
      "generics.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('test1', () => { assert.equal(1, 1); });\n" +
        "it('test the thing', () => { assert.equal(2, 2); });\n",
    );
    const report = analyseTestMetrics("node --test generics.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.ok(m.genericNames.length > 0, `expected generic names detected, got ${m.genericNames.length}`);
  });

  it("detects error path test functions", () => {
    writeFile(
      tmp,
      "errors.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('throws on invalid input', () => {\n" +
        "  assert.throws(() => parseInt('abc'), /NaN/);\n" +
        "});\n",
    );
    const report = analyseTestMetrics("vitest errors.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.ok(m.errorPathFunctions > 0, `expected error path function detected, got ${m.errorPathFunctions}`);
  });

  it("detects hasRealTime when Date.now called without mock", () => {
    writeFile(
      tmp,
      "realtime.test.ts",
      "import { describe, it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('timestamps', () => {\n" +
        "  const now = Date.now();\n" +
        "  assert.ok(now > 0);\n" +
        "});\n",
    );
    const report = analyseTestMetrics("vitest realtime.test.ts", tmp);
    assert.ok(report !== null);
    const m = report.perFile[0];
    assert.equal(m.hasRealTime, true, "should detect real time usage");
  });

  it("skips files in dist/ and build/ directories", () => {
    mkdir(tmp, "dist");
    writeFile(
      tmp,
      "dist/skipme.test.ts",
      "import { it } from 'node:test';\n" +
        "import assert from 'node:assert/strict';\n" +
        "it('hi', () => { assert.equal(1, 1); });\n",
    );
    const report = analyseTestMetrics("node dist/skipme.test.ts", tmp);
    assert.equal(report, null, "should skip dist/ directory");
  });

  it("handles glob patterns in command", () => {
    const globDir = tmpDir();
    mkdir(globDir);
    try {
      writeFile(
        globDir,
        "glob-a.test.ts",
        "import { it } from 'node:test';\nimport assert from 'node:assert/strict';\nit('a', () => { assert.equal(1, 1); });\n",
      );
      writeFile(
        globDir,
        "glob-b.test.ts",
        "import { it } from 'node:test';\nimport assert from 'node:assert/strict';\nit('b', () => { assert.equal(2, 2); });\n",
      );
      // Just the glob pattern — tool names are filtered out by extractTestFilesFromCommand
      const report = analyseTestMetrics("*.test.ts", globDir);
      assert.ok(report !== null);
      assert.equal(report?.perFile.length, 2, `glob should find 2 files, got ${report?.perFile.length}`);
    } finally {
      try {
        rmSync(globDir, { recursive: true, force: true });
      } catch {
        /* cleanup */
      }
    }
  });
});
