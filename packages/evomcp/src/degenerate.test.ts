import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDegenerate } from "./degenerate.js";

function makeFileMap(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

// ── Diff builders ──────────────────────────────────────────────────────────

/** Minimal valid unified diff with one insertion. */
function insertDiff(file: string, addedLines: string[]): string {
  const hdr = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,0 +1,${addedLines.length} @@`,
  ];
  return `${[...hdr, ...addedLines.map((l) => `+${l}`)].join("\n")}\n`;
}

/** Minimal unified diff with one deletion. */
function deleteDiff(file: string, removedLines: string[]): string {
  const hdr = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${removedLines.length} +0,0 @@`,
  ];
  return `${[...hdr, ...removedLines.map((l) => `-${l}`)].join("\n")}\n`;
}

/** Build a diff with mixed +/- lines. */
function mixedDiff(file: string, lines: Array<{ op: "+" | "-"; text: string }>): string {
  const chunk = lines.map((l) => l.op + l.text);
  const hdr = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${chunk.length} +1,${chunk.length} @@`,
  ];
  return `${[...hdr, ...chunk].join("\n")}\n`;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("detectDegenerate", () => {
  // ── Edge / empty ───────────────────────────────────────────────────────

  it("returns clean for empty string", () => {
    const r = detectDegenerate("");
    assert.equal(r.clean, true);
    assert.equal(r.findings.length, 0);
    assert.equal(r.summary, "No diff to analyze.");
  });

  it("returns clean for nullish/whitespace-only diff", () => {
    assert.equal(detectDegenerate("   ").clean, true);
    assert.equal(detectDegenerate("\n\n").clean, true);
    assert.equal(detectDegenerate("\t").clean, true);
  });

  it("returns clean for diff with no changed lines", () => {
    const diff = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,0 +1,0 @@"].join("\n");
    const r = detectDegenerate(diff);
    assert.equal(r.clean, true);
    assert.equal(r.findings.length, 0);
  });

  // ── Hardcoded test outputs ─────────────────────────────────────────────

  describe("hardcoded_test_output", () => {
    it("detects expect(fn('literal')).toBe('literal') as block", () => {
      const diff = insertDiff("src/login.test.ts", [`  expect(fn("admin")).toBe("admin")`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
      assert.match(f[0].message, /hardcoded answer/);
      assert.equal(r.clean, false);
    });

    it("detects assertEq(fn(42), 42) as block", () => {
      const diff = insertDiff("src/math.test.ts", [`  assertEq(fn(42), 42)`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
      assert.match(f[0].message, /hardcoded answer/);
    });

    it("detects assertEq(fn(3.14), 3.14) with decimals", () => {
      const diff = insertDiff("src/float.test.ts", [`  assertEq(compute(3.14), 3.14)`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("detects assertStrictEqual(fn(99), 99)", () => {
      const diff = insertDiff("src/num.test.ts", [`  assertStrictEqual(fn(99), 99)`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 1);
    });

    it("detects .toEqual and .toStrictEqual variants", () => {
      const diff = insertDiff("src/variants.test.ts", [
        `  expect(fn("secret")).toEqual("secret")`,
        `  expect(fn("pass")).toStrictEqual("pass")`,
        `  expect(fn("key")).toBeTruthy("key")`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 3);
      for (const ff of f) assert.equal(ff.severity, "block");
    });

    it("does NOT flag non-hardcoded assertions", () => {
      const diff = insertDiff("src/ok.test.ts", [
        `  expect(result).toBe("admin")`,
        `  expect(fn(input)).toBe("expected")`,
        `  assertEquals(fn(x), expected)`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 0);
    });
  });

  // ── Deleted assertions ─────────────────────────────────────────────────

  describe("deleted_assertion", () => {
    it("blocks when 3+ assertion lines removed in test files", () => {
      const diff = deleteDiff("src/user.test.ts", [
        `  expect(result).toBe("ok")`,
        `  assert.equal(count, 5)`,
        `  assertThat(list).contains("x")`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
      assert.match(f[0].message, /3 assertion lines deleted/);
    });

    it("warns when 1-2 assertion lines removed", () => {
      const diff = deleteDiff("src/user.test.ts", [`  expect(result).toBe("ok")`, `  const x = 1;`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
    });

    it("warns even for a single deleted assertion", () => {
      const diff = deleteDiff("src/user.test.ts", [`  expect(result).toBe("ok")`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
    });

    it("counts various assertion keywords (expect, should, must)", () => {
      // Note: assert_eq isn't matched because `_` is a \w char so \b
      // after `assert_` fails when _ is followed by e (both word chars).
      const diff = deleteDiff("src/check.test.ts", [
        `  expect(result).toBe("x")`,
        `  should.contain(result, "x")`,
        `  must.be.true(result)`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("does not flag non-assertion deletions", () => {
      const diff = deleteDiff("src/user.test.ts", [`  const x = compute();`, `  console.log(x);`, `  return x;`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 0);
    });

    it("reports affected file names in message", () => {
      const diff = deleteDiff("src/tests/auth.test.ts", [
        `  expect(user).toBeTruthy()`,
        `  assert.ok(valid)`,
        `  assertEq(role, "admin")`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.match(f[0].file, /tests/);
    });
  });

  // ── Broadened catches ──────────────────────────────────────────────────

  describe("broadened_catch", () => {
    it("blocks when specific catch replaced with broad Exception", () => {
      const diff = mixedDiff("src/handler.py", [
        { op: "-", text: "    except ValueError:" },
        { op: "+", text: "    except Exception:" },
        { op: "+", text: "        pass" },
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
      assert.match(f[0].message, /replaced/);
    });

    it("blocks for JS catch (Error → broad catch)", () => {
      const diff = mixedDiff("src/api.ts", [
        { op: "-", text: "  } catch (NetworkError) {" },
        { op: "+", text: "  } catch (e) {" },
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks for catch(...) spread pattern", () => {
      const diff = mixedDiff("src/api.ts", [
        { op: "-", text: "  } catch (TimeoutError) {" },
        { op: "+", text: "  } catch (...) {" },
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("warns when 3+ broad catches added without removing specifics", () => {
      const diff = insertDiff("src/handler.py", [
        "    except Exception:",
        "        pass",
        "    except BaseException:",
        "        pass",
        "    except Throwable:",
        "        pass",
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
      assert.match(f[0].message, /broad exception catches added/);
    });

    it("does not flag when only specifics are used", () => {
      const diff = insertDiff("src/handler.py", [
        "    except ValueError:",
        "        pass",
        "    except KeyError:",
        "        pass",
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 0);
    });

    it("does not flag 1-2 broad catches without specific removal", () => {
      const diff = insertDiff("src/handler.py", ["    except Exception:", "        pass"]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "broadened_catch");
      assert.equal(f.length, 0);
    });
  });

  // ── Type ignore density ────────────────────────────────────────────────
  //
  // NOTE: The suppress regex in detectTypeIgnoreDensity has a `\b` before every
  // alternative: \b(?:@ts-expect-error|@ts-expect-error|#\s*type:\s*ignore|…).
  // Both @ and # are non-word characters, so \b before them only matches when
  // directly preceded by a word character (e.g. `line@ts-expect-error` but NOT
  // `// @ts-expect-error` where space precedes @).  In realistic TypeScript/Python
  // code these patterns don't trigger.  The tests below use patterns that
  // DO match the regex (wordChar directly before @ or #) to exercise the
  // density calculation logic.  If the regex is fixed to drop the `\b` or
  // use a different assertion, update these tests accordingly.

  describe("type_ignore_density", () => {
    /**
     * Build a diff with `total` added lines, of which `suppress` have
     * a type-suppression pattern (preceded by a word char to satisfy \b).
     */
    function buildTypeIgnoreDiff(total: number, suppress: number, suppressLine = "x@ts-ignore"): string {
      const lines: string[] = [];
      for (let i = 0; i < suppress; i++) {
        lines.push(suppressLine);
      }
      for (let i = suppress; i < total; i++) {
        lines.push(`const x${i} = ${i};`);
      }
      return insertDiff("src/handler.ts", lines);
    }

    it("blocks when >5% of added lines suppress type checking", () => {
      // 2/25 = 8% > 5% → block.  "x@ts-expect-error" matches \b(?:@ts-expect-error) because
      // 'x' is a word char directly before '@'.
      const diff = buildTypeIgnoreDiff(25, 2);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "type_ignore_density");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
      assert.match(f[0].message, />/);
    });

    it("warns when some suppressions but below 5% threshold", () => {
      // 1/25 = 4% < 5% → warn
      const diff = buildTypeIgnoreDiff(25, 1);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "type_ignore_density");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
    });

    it("skips density check on tiny diffs (< 20 added lines)", () => {
      // 2/10 even though 20% → no finding because < 20 total
      const diff = buildTypeIgnoreDiff(10, 2);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "type_ignore_density");
      assert.equal(f.length, 0);
    });

    it("detects @ts-expect-error and # noqa variants", () => {
      // Each suppress line uses a word char directly before @ or # so \b fires.
      const lines: string[] = [];
      for (let i = 0; i < 22; i++) lines.push(`const x${i} = ${i};`);
      lines[0] = `a@ts-expect-error`;
      lines[1] = `b# type: ignore`;
      lines[2] = `c# noqa`;
      lines[3] = `d# pylint: disable=unused-import`;
      const diff = insertDiff("src/ignore.ts", lines);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "type_ignore_density");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block"); // 4/22 = 18.2% > 5%
    });

    it("detects `#[allow(` pattern", () => {
      const lines: string[] = [];
      for (let i = 0; i < 22; i++) lines.push(`const x${i} = ${i};`);
      // #[allow(] in the regex is a character class: [#allow(] — matches #, a,
      // l, o, w, or (.  With word char before # for \b.
      lines[0] = `#[allow(unused)]`;
      const diff = insertDiff("src/rust.rs", lines);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "type_ignore_density");
      // \\#[allow\\( is now detected by the fixed regex. 1/22 = 4.5% < 5% → warn.
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
    });
  });

  // ── Disabled lint ──────────────────────────────────────────────────────

  describe("disabled_lint", () => {
    it("blocks on eslint-disable", () => {
      const diff = insertDiff("src/app.ts", [`  // eslint-disable-next-line no-eval`, `  eval(code)`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks on biome-ignore", () => {
      const diff = insertDiff("src/app.ts", [
        `  // biome-ignore lint/suspicious/noExplicitAny: legacy`,
        `  const x: any = y;`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks on ruff: noqa", () => {
      const diff = insertDiff("src/main.py", [`  # ruff: noqa: F841`, `  unused = 1`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks on pylint disable", () => {
      const diff = insertDiff("src/main.py", [`  # pylint: disable=unused-variable`, `  x = 1`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks on noinspection (IntelliJ)", () => {
      const diff = insertDiff("src/app.ts", [`  // noinspection JSUnusedLocalSymbols`, `  const x = 1;`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("flags multiple lint disables independently", () => {
      const diff = insertDiff("src/app.ts", [`  // eslint-disable-next-line`, `  // biome-ignore`, `  // ruff: noqa`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 3);
    });

    it("does not flag normal comments", () => {
      const diff = insertDiff("src/app.ts", [`  // this is just a comment`, `  const x = 1;`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "disabled_lint");
      assert.equal(f.length, 0);
    });
  });

  // ── Commented-out code ─────────────────────────────────────────────────

  describe("commented_out_code", () => {
    /**
     * Build a diff with `total` added lines where a run of `consecutive`
     * lines are commented-out (starting at line index `start`).
     */
    function buildCommentedDiff(total: number, start: number, consecutive: number, commentPrefix = "//"): string {
      const lines: string[] = [];
      for (let i = 0; i < total; i++) {
        if (i >= start && i < start + consecutive) {
          lines.push(`${commentPrefix} const oldCode${i} = ${i};`);
        } else {
          lines.push(`const active${i} = ${i};`);
        }
      }
      return insertDiff("src/module.ts", lines);
    }

    it("warns on 3+ consecutive commented-out lines", () => {
      // Total 25 lines, run of 3 at start
      const diff = buildCommentedDiff(25, 0, 3);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
      assert.match(f[0].message, /commented-out/);
    });

    it("warns on longer runs of commented-out lines", () => {
      const diff = buildCommentedDiff(25, 5, 8);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 1);
    });

    it("warns on Python-style # comments", () => {
      const diff = buildCommentedDiff(25, 0, 4, "#");
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 1);
    });

    it("detects multiple separate runs of commented-out code", () => {
      const lines: string[] = [];
      for (let i = 0; i < 25; i++) lines.push(`const a${i} = ${i};`);
      lines[0] = "// const x = 1;";
      lines[1] = "// const y = 2;";
      lines[2] = "// const z = 3;";
      lines[10] = "// const a = 10;";
      lines[11] = "// const b = 20;";
      lines[12] = "// const c = 30;";
      const diff = insertDiff("src/mod.ts", lines);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 2);
    });

    it("skips check on diffs with < 20 lines", () => {
      // Only 10 lines total, run of 5 commented → no finding
      const diff = buildCommentedDiff(10, 0, 5);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 0);
    });

    it("does not warn on short comment runs (< 3)", () => {
      const diff = buildCommentedDiff(25, 0, 2);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "commented_out_code");
      assert.equal(f.length, 0);
    });
  });

  // ── Empty tests ────────────────────────────────────────────────────────

  describe("empty_test", () => {
    it("blocks on test with empty arrow function body", () => {
      const diff = insertDiff("src/user.test.ts", [`test("returns null for missing user", () => {})`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "empty_test");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("blocks on async empty test", () => {
      const diff = insertDiff("src/user.test.ts", [`test("fetches data", async () => {})`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "empty_test");
      assert.equal(f.length, 1);
    });

    it("blocks on it() empty test", () => {
      const diff = insertDiff("src/user.test.ts", [`it("should validate", () => {})`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "empty_test");
      assert.equal(f.length, 1);
    });

    it("does NOT flag tests with body content", () => {
      const diff = insertDiff("src/user.test.ts", [
        `test("returns user", () => {`,
        `  expect(result).toBe(user);`,
        `})`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "empty_test");
      assert.equal(f.length, 0);
    });

    it("does NOT flag function definitions that are not tests", () => {
      const diff = insertDiff("src/utils.ts", [`  const fn = () => {}`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "empty_test");
      assert.equal(f.length, 0);
    });
  });

  // ── TODO bombs ─────────────────────────────────────────────────────────

  describe("todo_bomb", () => {
    it("warns on 3+ TODO markers in production files", () => {
      const diff = insertDiff("src/handler.ts", [
        `  // TODO: implement pagination`,
        `  // FIXME: this crashes on empty input`,
        `  // HACK: workaround for API bug`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "todo_bomb");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
      assert.match(f[0].message, /TODO\/FIXME\/HACK/);
    });

    it("warns on XXX and WORKAROUND markers too", () => {
      const diff = insertDiff("src/handler.ts", [
        `  // XXX: slow path`,
        `  // WORKAROUND: browser quirk`,
        `  // TODO: clean this up`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "todo_bomb");
      assert.equal(f.length, 1);
    });

    it("does not flag 1-2 todo markers", () => {
      const diff = insertDiff("src/handler.ts", [`  // TODO: implement pagination`, `  // FIXME: handle edge case`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "todo_bomb");
      assert.equal(f.length, 0);
    });

    it("does not flag TODOs in test files", () => {
      const diff = insertDiff("src/handler.test.ts", [
        `  // TODO: add more edge cases`,
        `  // FIXME: unstable test`,
        `  // TODO: cover null input`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "todo_bomb");
      assert.equal(f.length, 0);
    });

    it("is case-insensitive for todo keywords", () => {
      const diff = insertDiff("src/handler.ts", [
        `  // todo: implement`,
        `  // fixme: broken`,
        `  // Hack: workaround`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "todo_bomb");
      assert.equal(f.length, 1);
    });
  });

  // ── Clean diff ─────────────────────────────────────────────────────────

  describe("clean diff", () => {
    it("returns clean=true and no findings for harmless changes", () => {
      const diff = insertDiff("src/login.ts", [
        `  const name = user.name;`,
        `  const role = user.role;`,
        `  return { name, role };`,
      ]);
      const r = detectDegenerate(diff);
      assert.equal(r.clean, true);
      assert.equal(r.findings.length, 0);
      assert.equal(r.summary, "No degenerate patterns detected.");
    });
  });

  // ── Multiple patterns simultaneously ───────────────────────────────────

  describe("multiple patterns", () => {
    it("reports multiple findings across different detectors", () => {
      const diff = [
        "diff --git a/src/handler.test.ts b/src/handler.test.ts",
        "--- a/src/handler.test.ts",
        "+++ b/src/handler.test.ts",
        "@@ -1,1 +1,3 @@",
        "+  expect(fn('admin')).toBe('admin')",
        "+  // eslint-disable-next-line",
        "+  // TODO: fix this",
      ].join("\n");
      const r = detectDegenerate(diff);
      const types = r.findings.map((f) => f.type);
      assert.ok(types.includes("hardcoded_test_output"));
      assert.ok(types.includes("disabled_lint"));
      assert.equal(r.clean, false);
    });

    it("summary includes all block-level findings", () => {
      const diff = [
        "diff --git a/src/handler.test.ts b/src/handler.test.ts",
        "--- a/src/handler.test.ts",
        "+++ b/src/handler.test.ts",
        "@@ -1,1 +1,3 @@",
        "+  expect(fn('root')).toBe('root')",
        "+  // eslint-disable-next-line",
        "+  // biome-ignore",
      ].join("\n");
      const r = detectDegenerate(diff);
      assert.equal(r.clean, false);
      assert.match(r.summary, /BLOCKED/);
      assert.match(r.summary, /hardcoded_test_output/);
      assert.match(r.summary, /disabled_lint/);
    });
  });

  // ── files parameter (placeholder) ──────────────────────────────────────

  describe("files parameter", () => {
    it("accepts optional file map without error (placeholder path)", () => {
      const diff = insertDiff("src/login.test.ts", [`  expect(result).toBe("ok")`]);
      const files = makeFileMap({
        "src/login.test.ts": `test("login", () => { expect(result).toBe("ok"); })`,
      });
      const r = detectDegenerate(diff, files);
      // The detectHardcodedInFiles is a no-op, so files param doesn't change
      // findings.  Still a valid test that the function accepts it.
      assert.ok(Array.isArray(r.findings));
    });
  });

  // ── Regression: diff parsing edge cases ────────────────────────────────

  describe("diff parsing edge cases", () => {
    it("handles diffs with multiple files", () => {
      const lines1 = [
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,0 +1,1 @@",
        "+  const x = 1;",
      ];
      const lines2 = [
        "diff --git a/src/b.ts b/src/b.ts",
        "--- a/src/b.ts",
        "+++ b/src/b.ts",
        "@@ -1,0 +1,1 @@",
        "+  // TODO: implement",
      ];
      const diff = [...lines1, ...lines2].join("\n");
      const r = detectDegenerate(diff);
      // Only 1 TODO in b.ts → no finding (need 3)
      assert.equal(r.clean, true);
    });

    it("handles hunk headers with line counts", () => {
      const diff = [
        "diff --git a/src/login.test.ts b/src/login.test.ts",
        "--- a/src/login.test.ts",
        "+++ b/src/login.test.ts",
        "@@ -1,5 +1,6 @@",
        "  import { test } from 'test'",
        "+  expect(fn('admin')).toBe('admin')",
        "  const x = 1;",
        "  const y = 2;",
      ].join("\n");
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      assert.equal(f.length, 1);
      // Line number should be from the hunk header (old 1,5 / new 1,6 → line 2)
      assert.equal(f[0].line, 2);
    });

    it("handles diffs with only removed lines", () => {
      const diff = deleteDiff("src/user.test.ts", [`  expect(result).toBe("ok")`, `  assert.ok(valid)`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "warn");
    });

    it("handles diff with trailing newline variants", () => {
      // No trailing newline
      const diff = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,0 +1,1 @@\n+  const x = 1;";
      const r = detectDegenerate(diff);
      assert.equal(r.clean, true);
    });

    it("detects isTestFile via .spec. pattern", () => {
      const diff = deleteDiff("src/auth.spec.ts", [
        `  expect(result).toBe("ok")`,
        `  assert.equal(x, 1)`,
        `  assertThat(y).isTrue()`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("detects isTestFile via /tests/ path pattern", () => {
      const diff = deleteDiff("tests/unit/auth.ts", [
        `  expect(result).toBe("ok")`,
        `  assert.equal(x, 1)`,
        `  assertThat(y).isTrue()`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });

    it("detects isTestFile via Test. prefix", () => {
      const diff = deleteDiff("TestAuth.php", [
        `  expect(result).toBe("ok")`,
        `  assert.equal(x, 1)`,
        `  assertThat(y).isTrue()`,
      ]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "deleted_assertion");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "block");
    });
  });

  // ── Big combined scenario ──────────────────────────────────────────────

  describe("combined scenario", () => {
    it("produces correct summary with multiple finding types", () => {
      // A diff that triggers: hardcoded output (block), disabled lint (block),
      // deleted assertion (1 deletion = warn), TODO (1 = no finding)
      const diff = [
        "diff --git a/src/user.test.ts b/src/user.test.ts",
        "--- a/src/user.test.ts",
        "+++ b/src/user.test.ts",
        "@@ -1,3 +1,4 @@",
        "  import { test } from 'test'",
        "-  expect(result).toBeTruthy()",
        "+  expect(fn('admin')).toBeTruthy('admin')",
        "+  // eslint-disable-next-line",
        "",
        "diff --git a/src/utils.ts b/src/utils.ts",
        "--- a/src/utils.ts",
        "+++ b/src/utils.ts",
        "@@ -10,0 +11,2 @@",
        "+  // TODO: optimize this",
        "+  const x = 1;",
      ].join("\n");
      const r = detectDegenerate(diff);
      // hardcoded_test_output (block) + deleted_assertion (warn) + disabled_lint (block)
      // TODO is only 1 so no finding
      assert.equal(r.findings.length, 3);
      assert.equal(r.clean, false); // block findings exist
      assert.match(r.summary, /BLOCKED/);
      // Verify both block types are in summary
      assert.match(r.summary, /hardcoded_test_output/);
      assert.match(r.summary, /disabled_lint/);
    });
  });

  // ── Bugs / edge behavior ───────────────────────────────────────────────

  describe("edge cases", () => {
    it("does not crash on malformed diff without file headers", () => {
      const diff = ["this is not a diff", "just some random text", "+added line", "-removed line"].join("\n");
      // Should not throw
      const r = detectDegenerate(diff);
      assert.ok(Array.isArray(r.findings));
    });

    it("does not crash on diff with empty hunk header", () => {
      const diff = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -0,0 +0,0 @@"].join(
        "\n",
      );
      const r = detectDegenerate(diff);
      assert.equal(r.clean, true);
    });

    it("handles diffs with special characters in patterns", () => {
      // Literal with special regex chars
      const diff = insertDiff("src/login.test.ts", [`  expect(fn("admin.test(1)")).toBe("admin.test(1)")`]);
      const r = detectDegenerate(diff);
      const f = r.findings.filter((f) => f.type === "hardcoded_test_output");
      // The capture group \1 backreference works with literal string match,
      // so special chars inside the captured value are matched literally
      assert.equal(f.length, 1);
    });
  });
});
