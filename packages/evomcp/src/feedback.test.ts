import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { compileFeedback, compileFileFeedback, estimateTokens, fallbackDiagnostic } from "./feedback.js";
import type { Diagnostic } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────

function withTempDir(fn: (tmpDir: string) => void): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-test-"));
  try {
    fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function createTempFile(tmpDir: string, name: string, lineCount: number): string {
  const filePath = path.join(tmpDir, name);
  const lines = Array.from({ length: lineCount }, (_, i) => `// line ${i + 1}`);
  fs.writeFileSync(filePath, lines.join("\n"));
  return filePath;
}

// ── compileFeedback ────────────────────────────────────────────────

describe("compileFeedback — empty / null input", () => {
  it("returns [] for empty string", () => {
    assert.deepStrictEqual(compileFeedback("", "/tmp", "test-gate"), []);
  });

  it("returns [] for whitespace-only string", () => {
    assert.deepStrictEqual(compileFeedback("   \n  \n  ", "/tmp", "test-gate"), []);
  });

  it("returns [] for string with only newlines", () => {
    assert.deepStrictEqual(compileFeedback("\n\n\n", "/tmp", "test-gate"), []);
  });
});

describe("compileFeedback — TypeScript errors", () => {
  it("parses a single TypeScript error", () => {
    const result = compileFeedback(
      "src/test.ts(42,10): error TS2345: Type '\"foo\"' is not assignable to type 'number'",
      "/tmp",
      "tsc",
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/test.ts");
    assert.equal(result[0].line, 42);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("not assignable"));
    assert.equal(result[0].oracle_type, "tsc");
  });

  it("parses a TypeScript warning", () => {
    const result = compileFeedback("src/test.ts(10,1): warning TS1234: unused variable 'x'", "/tmp", "tsc");
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "warning");
    assert.equal(result[0].line, 10);
  });

  it("parses multiple TypeScript errors", () => {
    const input = [
      "src/a.ts(1,1): error TS1000: first error",
      "src/b.ts(2,1): error TS2000: second error",
      "src/c.ts(3,1): error TS3000: third error",
    ].join("\n");
    const result = compileFeedback(input, "/tmp", "tsc");
    assert.equal(result.length, 3);
  });

  it("handles absolute Windows paths in TypeScript format", () => {
    // TypeScript regex captures everything up to the first '(' — works with drive letters
    const result = compileFeedback(
      'C:\\Users\\test\\src\\file.ts(15,3): error TS2322: Type "X" is not assignable',
      "C:\\Users\\test",
      "tsc",
    );
    assert.equal(result.length, 1);
    assert.ok(result[0].file.includes("file.ts"));
    assert.equal(result[0].line, 15);
  });
});

describe("compileFeedback — ESLint errors", () => {
  it("parses an ESLint error", () => {
    const result = compileFeedback(
      "src/app.js:10:5: error \"no-unused-vars\" 'x' is defined but never used",
      "/tmp",
      "eslint",
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/app.js");
    assert.equal(result[0].line, 10);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("no-unused-vars"));
    assert.equal(result[0].oracle_type, "eslint");
  });

  it("parses an ESLint warning", () => {
    const result = compileFeedback(
      "src/app.js:25:1: warning \"prefer-const\" 'let' is never reassigned",
      "/tmp",
      "eslint",
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "warning");
  });
});

describe("compileFeedback — Biome errors", () => {
  it("parses a Biome error", () => {
    const result = compileFeedback(
      // Biome regex expects a space after severity keyword
      "src/file.ts:10:5 error [noUnusedVariables] '_x' is declared but never used",
      "/tmp",
      "biome",
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/file.ts");
    assert.equal(result[0].line, 10);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("noUnusedVariables"));
    assert.equal(result[0].oracle_type, "biome");
  });

  it("parses a Biome warning", () => {
    const result = compileFeedback("src/file.ts:20:7 warning lint/suspicious/noDoubleEquals message", "/tmp", "biome");
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "warning");
  });

  it("parses a Biome info", () => {
    const result = compileFeedback("src/file.ts:30:5 info some informational message", "/tmp", "biome");
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "info");
  });
});

describe("compileFeedback — Python tracebacks", () => {
  it("parses a Python traceback line", () => {
    const result = compileFeedback('  File "src/main.py", line 42, in run_something', "/tmp", "pytest");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/main.py");
    assert.equal(result[0].line, 42);
    assert.equal(result[0].severity, "error");
    // The full line is stored as the message for Python
    assert.ok(result[0].message.includes("File"));
    assert.ok(result[0].message.includes("main.py"));
    assert.equal(result[0].oracle_type, "pytest");
  });

  it("parses a Python traceback with absolute path", () => {
    const result = compileFeedback('  File "/home/user/project/src/main.py", line 99, in <module>', "/tmp", "pytest");
    assert.equal(result.length, 1);
    assert.ok(result[0].file.includes("main.py"));
    assert.equal(result[0].line, 99);
  });
});

describe("compileFeedback — Rust errors", () => {
  it("parses a Rust error with location", () => {
    const input = ["error[E0308]: mismatched types", "   --> src/main.rs:42:10"].join("\n");
    const result = compileFeedback(input, "/tmp", "rustc");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/main.rs");
    assert.equal(result[0].line, 42);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("E0308"));
    assert.ok(result[0].message.includes("mismatched types"));
    assert.equal(result[0].oracle_type, "rustc");
  });

  it("parses a Rust warning with location", () => {
    const input = ["warning[W0001]: unused variable `x`", "  --> src/lib.rs:15:9"].join("\n");
    const result = compileFeedback(input, "/tmp", "rustc");
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "error"); // All Rust diagnostics tagged as error severity
    assert.equal(result[0].file, "src/lib.rs");
    assert.equal(result[0].line, 15);
  });

  it("handles Rust error without subsequent location line", () => {
    const result = compileFeedback("error[E0432]: unresolved import `foo`", "/tmp", "rustc");
    // Single error with empty file and line 0 (no location line follows)
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "");
    assert.equal(result[0].line, 0);
  });

  it("handles Rust location line without prior error", () => {
    // Location line with no preceding error is simply ignored
    const result = compileFeedback("   --> src/main.rs:42:10", "/tmp", "rustc");
    // Nothing matches — falls through to fallback
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "");
    // Actually, the location line itself isn't a standalone diagnostic format,
    // so it would fall through and use the expect/assert parsing since it's
    // just whitespace + text. Let me check: "^\\s*--> src/main.rs:42:10"
    // doesn't match any of the expect/assert prefixes. So it's unparseable → fallback.
    assert.equal(result[0].severity, "error");
  });
});

describe("compileFeedback — Go errors", () => {
  it("parses a Go compiler error", () => {
    const result = compileFeedback("src/main.go:42:10: undefined: someVar", "/tmp", "go");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/main.go");
    assert.equal(result[0].line, 42);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("undefined"));
    assert.equal(result[0].oracle_type, "go");
  });

  it("parses multiple Go errors", () => {
    const input = [
      "src/main.go:10:5: cannot use str (variable of type string) as type int",
      "src/util.go:25:3: not enough arguments in call",
    ].join("\n");
    const result = compileFeedback(input, "/tmp", "go");
    assert.equal(result.length, 2);
  });
});

describe("compileFeedback — Jest/Vitest assertion failures", () => {
  it("parses Expected line", () => {
    const result = compileFeedback('  Expected: "foo"', "/tmp", "vitest");
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("Expected"));
    assert.equal(result[0].oracle_type, "vitest");
  });

  it("parses Received line", () => {
    const result = compileFeedback('  Received: "bar"', "/tmp", "vitest");
    assert.equal(result.length, 1);
    assert.ok(result[0].message.includes("Received"));
  });

  it("parses expect( line", () => {
    const result = compileFeedback(" expect(received).toBe(expected)", "/tmp", "vitest");
    assert.equal(result.length, 1);
    assert.ok(result[0].message.includes("expect("));
  });

  it("parses assert line", () => {
    const result = compileFeedback("assert.strictEqual(actual, expected)", "/tmp", "vitest");
    assert.equal(result.length, 1);
    assert.ok(result[0].message.includes("assert"));
  });

  it("handles full Jest failure output", () => {
    // Jest output often starts with ● for test name
    const result = compileFeedback(
      [
        "  ● AuthService › authenticate › validates credentials",
        "    expect(received).toBe(expected)",
        '    Expected: "true"',
        '    Received: "false"',
      ].join("\n"),
      "/tmp",
      "jest",
    );
    // "  ● AuthService..." — doesn't match any format (no file:line), so falls through
    // "    expect..." — matches jestFailRe
    // '    Expected: "true"' — matches jestFailRe
    // '    Received: "false"' — matches jestFailRe
    assert.equal(result.length, 3);
  });
});

describe("compileFeedback — fallback for unparseable output", () => {
  it("returns fallback diagnostic for entirely unparseable output", () => {
    const result = compileFeedback("Something completely unexpected happened here", "/tmp", "generic");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "");
    assert.equal(result[0].line, 0);
    assert.equal(result[0].severity, "error");
    assert.ok(result[0].message.includes("Something completely unexpected"));
    assert.equal(result[0].oracle_type, "generic");
  });

  it("returns fallback for binary/non-text output", () => {
    // Doesn't match any format, not even jestFailRe
    const result = compileFeedback("\x00\x01\x02\x03ERROR\xff\xfe", "/tmp", "binary");
    assert.equal(result.length, 1);
  });
});

describe("compileFeedback — mixed formats", () => {
  it("parses multiple formats in same output", () => {
    const input = [
      "src/app.ts(10,5): error TS2345: Type mismatch",
      "src/app.js:15:3: error \"no-undef\" 'foo' is not defined",
      "src/style.css:20:5 error [noUnknownSelector] unknown selector",
    ].join("\n");
    const result = compileFeedback(input, "/tmp", "mixed");
    assert.equal(result.length, 3);
    // Same severity → sorted by file path alphabetically: app.js < app.ts < style.css
    assert.equal(result[0].file, "src/app.js"); // ESLint (js < ts alphabetically)
    assert.equal(result[1].file, "src/app.ts"); // TypeScript
    assert.equal(result[2].file, "src/style.css"); // Biome
  });

  it("includes Python and Rust errors in mixed output", () => {
    const input = [
      '  File "src/main.py", line 42, in run',
      "error[E0001]: some Rust error",
      "   --> src/main.rs:10:5",
    ].join("\n");
    const result = compileFeedback(input, "/tmp", "mixed");
    assert.equal(result.length, 2); // Python + Rust
    assert.ok(result.some((d) => d.file.includes("main.py")));
    assert.ok(result.some((d) => d.file.includes("main.rs")));
  });
});

describe("compileFeedback — deduplication", () => {
  it("deduplicates identical file+line+message prefix", () => {
    const result = compileFeedback(
      ["src/test.ts(10,5): error TS1000: type mismatch", "src/test.ts(10,5): error TS1000: type mismatch"].join("\n"),
      "/tmp",
      "tsc",
    );
    assert.equal(result.length, 1);
  });

  it("keeps different errors on same line with different messages", () => {
    const result = compileFeedback(
      [
        "src/test.ts(10,5): error TS1000: type mismatch on variable",
        "src/test.ts(10,5): error TS2000: value is out of range",
      ].join("\n"),
      "/tmp",
      "tsc",
    );
    // Same file+line but different TS error codes → different message prefixes → kept
    assert.equal(result.length, 2);
  });

  it("keeps same message on different lines", () => {
    const result = compileFeedback(
      ["src/test.ts(10,5): error TS1000: type mismatch", "src/test.ts(20,5): error TS1000: type mismatch"].join("\n"),
      "/tmp",
      "tsc",
    );
    assert.equal(result.length, 2);
  });
});

describe("compileFeedback — sorting", () => {
  it("sorts errors before warnings before info", () => {
    withTempDir((tmpDir) => {
      createTempFile(tmpDir, "test.ts", 50);
      // Use relative paths — absolute Windows paths break Biome regex (drive letter colon)
      const input = [
        `test.ts:30:5 info informational message here`,
        `test.ts:10:5 error [E1] error message here`,
        `test.ts:20:5 warning [W1] warning message here`,
      ].join("\n");
      const result = compileFeedback(input, tmpDir, "biome");
      assert.equal(result.length, 3);
      assert.equal(result[0].severity, "error");
      assert.equal(result[1].severity, "warning");
      assert.equal(result[2].severity, "info");
    });
  });

  it("sorts within severity by file path then line number", () => {
    const input = [
      "src/z.ts(30,5): error TS1000: third",
      "src/a.ts(10,5): error TS1000: first",
      "src/a.ts(20,5): error TS1000: second",
    ].join("\n");
    const result = compileFeedback(input, "/tmp", "tsc");
    assert.equal(result.length, 3);
    assert.equal(result[0].file, "src/a.ts");
    assert.equal(result[0].line, 10);
    assert.equal(result[1].file, "src/a.ts");
    assert.equal(result[1].line, 20);
    assert.equal(result[2].file, "src/z.ts");
    assert.equal(result[2].line, 30);
  });
});

describe("compileFeedback — token budget capping", () => {
  it("drops info diagnostics when over token budget", () => {
    withTempDir((tmpDir) => {
      // Create a file with enough lines so context windows are non-trivial
      createTempFile(tmpDir, "test.ts", 100);

      // Generate enough errors/warnings/infos to exceed 300 tokens
      const errorLines: string[] = [];
      const warningLines: string[] = [];
      const infoLines: string[] = [];

      const testFile = path.join(tmpDir, "test.ts");

      // Each diagnostic gets ~20 lines of context → ~300 chars context per diagnostic
      // That's ~80 tokens per diagnostic, so ~15 diags easily exceed 300
      for (let i = 0; i < 6; i++) {
        errorLines.push(`${testFile}(${i + 5},1): error TS${1000 + i}: error number ${i}`);
      }
      for (let i = 0; i < 6; i++) {
        warningLines.push(`${testFile}(${i + 20},1): warning TS${2000 + i}: warning number ${i}`);
      }
      for (let i = 0; i < 6; i++) {
        infoLines.push(`${testFile}:${i + 40}:5 info info message ${i}`);
      }

      const result = compileFeedback([...errorLines, ...warningLines, ...infoLines].join("\n"), tmpDir, "budget-test");

      // Infos should be entirely dropped (all 6 removed)
      const infos = result.filter((d) => d.severity === "info");
      assert.equal(infos.length, 0, "info diagnostics should be dropped when over budget");

      // Errors should still be present
      const errors = result.filter((d) => d.severity === "error");
      assert.ok(errors.length > 0, "errors should remain after capping");
    });
  });

  it("drops warnings then truncates when even errors exceed budget", () => {
    withTempDir((tmpDir) => {
      createTempFile(tmpDir, "test.ts", 100);
      const testFile = path.join(tmpDir, "test.ts");

      const lines: string[] = [];
      // Generate many errors with long messages to exceed 300 tokens even after dropping
      for (let i = 0; i < 15; i++) {
        // Each error gets context from the temp file which makes it ~300 chars → ~80 tokens
        // 15 * 80 = 1200 >> 300 even after dropping everything but errors
        lines.push(`${testFile}(${i + 1},1): error TS${1000 + i}: very long error message `.repeat(3));
      }

      const result = compileFeedback(lines.join("\n"), tmpDir, "budget-test");

      // All results should be errors (no warnings or info)
      assert.ok(
        result.every((d) => d.severity === "error"),
        "only errors should remain",
      );

      // Messages should be truncated (original was >500 chars, now should be ≤100)
      for (const d of result) {
        assert.ok(d.message.length <= 100, `message should be truncated to ≤100 chars, got ${d.message.length}`);
      }

      // Context should be truncated (original was hundreds of chars, now should be ≤200)
      for (const d of result) {
        assert.ok(d.context.length <= 200, `context should be truncated to ≤200 chars, got ${d.context.length}`);
      }
    });
  });
});

describe("compileFeedback — context window attachment", () => {
  it("reads 20-line context around diagnostic line", () => {
    withTempDir((tmpDir) => {
      const testFile = createTempFile(tmpDir, "test.ts", 50);
      // Error points at line 42
      const result = compileFeedback(
        `${testFile}(42,5): error TS1000: test error for context verification`,
        tmpDir,
        "tsc",
      );
      assert.equal(result.length, 1);
      const context = result[0].context;

      // Context should include line numbers near the diagnostic
      assert.ok(context.includes("32:"), "context should start near line 32");
      assert.ok(context.includes("42:"), "context should include the error line");
      assert.ok(context.includes("50:"), "context should include line 50 (file end)");
      assert.ok(context.includes("// line 42"), "context should contain source content");
    });
  });

  it("provides context starting at line 1 when diagnostic is near file start", () => {
    withTempDir((tmpDir) => {
      const testFile = createTempFile(tmpDir, "test.ts", 50);
      const result = compileFeedback(`${testFile}(2,1): error TS1000: error near start`, tmpDir, "tsc");
      assert.equal(result.length, 1);
      const context = result[0].context;
      assert.ok(context.startsWith("1:"), "context should start at line 1");
      assert.ok(context.includes("2:"), "context should include diagnostic line");
    });
  });

  it("skips context when file does not exist on disk", () => {
    const result = compileFeedback("nonexistent.ts(10,5): error TS1000: file not found", "/tmp", "tsc");
    assert.equal(result.length, 1);
    assert.equal(result[0].context, "", "no context when file doesn't exist");
  });

  it("skips context when file path is empty", () => {
    // Jest/Vitest assertion failures have empty file — no context read
    const result = compileFeedback('  Expected: "foo"', "/tmp", "vitest");
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "");
    assert.equal(result[0].context, "", "no context for diagnostics without file path");
  });

  it("caches file reads across diagnostics in the same file", () => {
    withTempDir((tmpDir) => {
      const testFile = createTempFile(tmpDir, "test.ts", 50);
      const input = [
        `${testFile}(10,5): error TS1000: first error`,
        `${testFile}(20,5): error TS2000: second error`,
        `${testFile}(30,5): error TS3000: third error`,
      ].join("\n");
      const result = compileFeedback(input, tmpDir, "tsc");
      assert.equal(result.length, 3);
      // All should have context (same file, cached reads)
      for (const d of result) {
        assert.ok(d.context.length > 0, "each diagnostic should have context");
      }
    });
  });
});

describe("compileFeedback — limits", () => {
  it("limits diagnostics to 100 maximum", () => {
    const lines: string[] = Array.from(
      { length: 150 },
      (_, i) => `test.ts(${i + 1},1): warning TS1000: warning number ${i}`,
    );
    const result = compileFeedback(lines.join("\n"), "/tmp", "limit-test");
    assert.ok(result.length <= 100, "should not exceed 100 diagnostics");
  });

  it("caps message length per diagnostic to 500 chars", () => {
    const longMsg = "very long message ".repeat(50); // ~800 chars
    const input = `test.ts(1,1): error TS2345: ${longMsg}`;
    const result = compileFeedback(input, "/tmp", "tsc");
    assert.equal(result.length, 1);
    assert.ok(result[0].message.length <= 500, "message should be capped at 500 chars");
  });
});

// ── compileFileFeedback ─────────────────────────────────────────────

describe("compileFileFeedback", () => {
  it("filters diagnostics to a specific file", () => {
    const input = [
      "src/a.ts(1,1): error TS1000: error in a",
      "src/b.ts(2,1): error TS2000: error in b",
      "src/a.ts(3,1): error TS3000: another in a",
    ].join("\n");
    const result = compileFileFeedback(input, "/tmp", "src/a.ts", "tsc");
    assert.equal(result.length, 2);
    assert.ok(result.every((d) => d.file === "src/a.ts"));
  });

  it("matches file via endsWith for absolute paths", () => {
    withTempDir((tmpDir) => {
      createTempFile(tmpDir, "a.ts", 10);
      const testFile = path.join(tmpDir, "a.ts");
      const input = `${testFile}(1,1): error TS1000: error message`;
      // Filter by relative path — should match via endsWith
      const result = compileFileFeedback(input, tmpDir, "a.ts", "tsc");
      assert.equal(result.length, 1);
    });
  });

  it("returns empty array when no diagnostics match", () => {
    const input = "src/a.ts(1,1): error TS1000: error message";
    const result = compileFileFeedback(input, "/tmp", "src/other.ts", "tsc");
    assert.equal(result.length, 0);
  });

  it("returns empty for empty input", () => {
    const result = compileFileFeedback("", "/tmp", "src/a.ts", "tsc");
    assert.deepStrictEqual(result, []);
  });
});

// ── estimateTokens ──────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for empty array", () => {
    assert.equal(estimateTokens([]), 0);
  });

  it("estimates tokens based on character count", () => {
    const diag: Diagnostic = {
      file: "test.ts",
      line: 1,
      severity: "error",
      message: "type error",
      context: "",
    };
    // chars = 7 + 10 + 0 + 10 = 27, tokens = ceil(27 * 0.25) = 7
    assert.equal(estimateTokens([diag]), 7);
  });

  it("includes context in token estimate", () => {
    const diag: Diagnostic = {
      file: "test.ts",
      line: 10,
      severity: "error",
      message: "error msg",
      context: "10: // line 10\n11: // line 11\n12: // line 12",
    };
    // chars = 7 + 10 + 40 + 10 = 67, tokens = ceil(67 * 0.25) = 17
    assert.equal(estimateTokens([diag]), 18);
  });

  it("sums tokens across multiple diagnostics", () => {
    const diags: Diagnostic[] = [
      { file: "a.ts", line: 1, severity: "error", message: "err1", context: "" },
      { file: "b.ts", line: 2, severity: "warning", message: "warn2", context: "" },
    ];
    // diag 1: 4 + 4 + 0 + 10 = 18 * 0.25 = 4.5 → ceil = 5
    // diag 2: 4 + 5 + 0 + 10 = 19 * 0.25 = 4.75 → ceil = 5
    // total = 10
    assert.equal(estimateTokens(diags), 10);
  });

  it("handles diagnostics with large content", () => {
    const diag: Diagnostic = {
      file: "x".repeat(50),
      line: 1,
      severity: "error",
      message: "x".repeat(500),
      context: "x".repeat(500),
    };
    // chars = 50 + 500 + 500 + 10 = 1060, tokens = ceil(1060 * 0.25) = 265
    assert.equal(estimateTokens([diag]), 265);
  });
});

// ── fallbackDiagnostic ──────────────────────────────────────────────

describe("fallbackDiagnostic", () => {
  it("creates an error diagnostic with the raw message", () => {
    const result = fallbackDiagnostic("some raw output here", "fallback-gate");
    assert.equal(result.severity, "error");
    assert.equal(result.file, "");
    assert.equal(result.line, 0);
    assert.equal(result.message, "some raw output here");
    assert.equal(result.context, "");
    assert.equal(result.oracle_type, "fallback-gate");
  });

  it("truncates very long messages to MAX_FEEDBACK_CHARS (2000)", () => {
    const long = "x".repeat(5000);
    const result = fallbackDiagnostic(long, "test");
    assert.ok(result.message.length <= 2000, "message should be truncated");
    assert.equal(result.message.length, 2000);
  });

  it("preserves short messages", () => {
    const result = fallbackDiagnostic("short msg", "test");
    assert.equal(result.message, "short msg");
  });

  it("handles empty message", () => {
    const result = fallbackDiagnostic("", "test");
    assert.equal(result.message, "");
    assert.equal(result.severity, "error");
  });
});
