import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GateRunner, parseDiagnostics, toOracleResult } from "./gates.js";
import type { GateResult } from "./types.js";

// ── parseDiagnostics ───────────────────────────────────────────────────

describe("parseDiagnostics", () => {
  it("returns empty for empty input", () => {
    assert.deepStrictEqual(parseDiagnostics("", "lint"), []);
  });

  it("returns empty for whitespace only", () => {
    assert.deepStrictEqual(parseDiagnostics("   \n  \n  ", "lint"), []);
  });

  it("parses TypeScript errors", () => {
    const output = "src/foo.ts(10,5): error TS2345: Argument of type 'string' is not assignable";
    const diags = parseDiagnostics(output, "build");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].file, "src/foo.ts");
    assert.equal(diags[0].line, 10);
    assert.equal(diags[0].severity, "error");
    assert.ok(diags[0].message.includes("Argument of type"));
  });

  it("parses TypeScript warnings", () => {
    const output = "src/bar.ts(42,8): warning TS6133: 'x' is declared but never used";
    const diags = parseDiagnostics(output, "build");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "warning");
    assert.ok(diags[0].message.includes("declared but never used"));
  });

  it("parses ESLint errors", () => {
    const output = "src/app.js:10:5: error 'no-unused-vars'  'x' is assigned but never used";
    const diags = parseDiagnostics(output, "lint");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].file, "src/app.js");
    assert.equal(diags[0].line, 10);
    assert.equal(diags[0].severity, "error");
  });

  it("parses ESLint warnings", () => {
    const output = "src/lib.js:15:3: warning 'no-console'  Unexpected console statement";
    const diags = parseDiagnostics(output, "lint");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "warning");
  });

  it("parses Biome output (without rule brackets)", () => {
    const output = "src/utils.ts:5:10 info This variable is unused";
    const diags = parseDiagnostics(output, "lint");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].file, "src/utils.ts");
    assert.equal(diags[0].line, 5);
    assert.equal(diags[0].severity, "info");
    assert.ok(diags[0].message.includes("unused"));
  });

  it("parses Biome warning", () => {
    const output = "src/old.ts:3:1 warning noNonNullAssertion Forbidden non-null assertion";
    const diags = parseDiagnostics(output, "lint");
    assert.equal(diags[0].severity, "warning");
  });

  it("parses Biome info", () => {
    const output = "src/style.ts:1:1 info format Formatting issues found";
    const diags = parseDiagnostics(output, "lint");
    assert.equal(diags[0].severity, "info");
  });

  it("handles mixed format output", () => {
    const output = [
      "src/a.ts(1,5): error TS2304: Cannot find name 'foo'",
      "src/b.js:10:5: error 'no-undef'  'bar' is not defined",
      "src/c.ts:20:3 warning noUnusedVariables This is unused",
    ].join("\n");
    const diags = parseDiagnostics(output, "build");
    assert.equal(diags.length, 3);
  });

  it("caps at 50 diagnostics", () => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`src/file${i}.ts(1,1): error TS9999: Error ${i}`);
    }
    const diags = parseDiagnostics(lines.join("\n"), "build");
    assert.ok(diags.length <= 50);
  });

  it("fallback to raw diagnostic for unparseable output", () => {
    const output = "Something went terribly wrong!\nNo file:line pattern here.";
    const diags = parseDiagnostics(output, "build");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "error");
    assert.ok(diags[0].message.includes("Something went terribly wrong"));
  });
});

// ── toOracleResult ─────────────────────────────────────────────────────

describe("toOracleResult", () => {
  it("passes when all gates pass", () => {
    const gates: GateResult[] = [
      { gate: "lint", passed: true, diagnostics: "", elapsed_ms: 100 },
      { gate: "build", passed: true, diagnostics: "", elapsed_ms: 200 },
      { gate: "test", passed: true, diagnostics: "", elapsed_ms: 300 },
    ];
    const result = toOracleResult(gates, "ci");
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
    assert.equal(result.elapsed_ms, 600);
  });

  it("fails when any gate fails", () => {
    const gates: GateResult[] = [
      { gate: "lint", passed: true, diagnostics: "", elapsed_ms: 100 },
      { gate: "build", passed: false, diagnostics: "error TS2345", elapsed_ms: 200 },
    ];
    const result = toOracleResult(gates, "ci");
    assert.equal(result.pass, false);
    assert.equal(result.score, 0.5);
  });

  it("handles empty gates array", () => {
    const result = toOracleResult([], "ci");
    assert.equal(result.pass, false); // 0 gates → no gates ran → pass=false
    assert.equal(result.score, 1.0);
  });

  it("forwards oracle_type", () => {
    const result = toOracleResult([], "custom-oracle");
    assert.equal(result.oracle_type, "custom-oracle");
  });

  it("includes diagnostics from failed gates", () => {
    const gates: GateResult[] = [
      { gate: "build", passed: false, diagnostics: "src/foo.ts(1,1): error TS2304: Cannot find name", elapsed_ms: 100 },
    ];
    const result = toOracleResult(gates, "ci");
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].file, "src/foo.ts");
  });
});

// ── GateRunner ─────────────────────────────────────────────────────────

describe("GateRunner", () => {
  it("runs a single gate command that succeeds", async () => {
    const runner = new GateRunner({ lint_cmd: process.platform === "win32" ? "cmd /c exit 0" : "true" });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 1);
    assert.equal(results[0].gate, "lint");
    assert.equal(results[0].passed, true);
  });

  it("runs a single gate command that fails", async () => {
    const runner = new GateRunner({ lint_cmd: process.platform === "win32" ? "cmd /c exit 1" : "false" });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 1);
    assert.equal(results[0].passed, false);
  });

  it("runs multiple gates in order", async () => {
    // Use echo + exit 0 for pass, echo + exit 1 for fail
    const runner = new GateRunner({
      lint_cmd: process.platform === "win32" ? "cmd /c \"echo lint-ok & exit 0\"" : "echo lint-ok",
      build_cmd: process.platform === "win32" ? "cmd /c \"echo build-ok & exit 0\"" : "echo build-ok",
    });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 2);
    assert.equal(results[0].gate, "lint");
    assert.equal(results[1].gate, "build");
    assert.equal(results[0].passed, true);
    assert.equal(results[1].passed, true);
  });

  it("short-circuits on first failure", async () => {
    const runner = new GateRunner({
      lint_cmd: process.platform === "win32" ? "cmd /c exit 1" : "false",
      build_cmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 1);
    assert.equal(results[0].gate, "lint");
    assert.equal(results[0].passed, false);
  });

  it("skips gates with no command configured", async () => {
    const runner = new GateRunner({ build_cmd: undefined, test_cmd: undefined });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 0);
  });

  it("runs only configured gates", async () => {
    const runner = new GateRunner({
      build_cmd: process.platform === "win32" ? "cmd /c exit 0" : "true",
    });
    const results = await runner.runAll("/tmp");
    assert.equal(results.length, 1);
    assert.equal(results[0].gate, "build");
  });
});
