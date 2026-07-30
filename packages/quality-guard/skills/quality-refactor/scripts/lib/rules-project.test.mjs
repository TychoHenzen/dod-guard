// Characterization tests for rules-project.mjs. Covers cross-file
// reachability and duplicate-block detection. These describe CURRENT
// behavior. They must not change it.
//
// Inputs are built directly as the shapes scanFile and loadFiles produce.
// That means rel, lang, isTest, lines, and a scans Map of code plus starts.
// This skips round tripping through disk and the full scanner.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfig } from "./config.mjs";
import { lineIndex } from "./offsets.mjs";
import { checkDuplication, checkReachability } from "./rules-project.mjs";

function fileWithCode(rel, code, { isTest = false, lang = "ts" } = {}) {
  return { rel, lang, isTest, source: code, lines: code.split("\n") };
}

function scansFor(files) {
  const scans = new Map();
  for (const file of files) scans.set(file.rel, { code: file.source, starts: lineIndex(file.source) });
  return scans;
}

test("checkReachability does not flag an export referenced by production code", () => {
  const a = fileWithCode("src/a.ts", "export function foo() {}\n");
  const b = fileWithCode("src/b.ts", "foo();\n");
  const files = [a, b];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config);
  assert.equal(
    violations.some((v) => v.file === "src/a.ts" && v.line === 1),
    false,
  );
});

test("checkReachability flags an export with no in-repo references as dead-export", () => {
  const a = fileWithCode("src/a.ts", "export function unusedFn() {}\n");
  const b = fileWithCode("src/b.ts", "console.log('nothing to do with it')\n");
  const files = [a, b];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "src/a.ts");
  assert.equal(violations[0].rule, "dead-export");
  assert.equal(violations[0].severity, config.presence["dead-export"]);
  assert.match(violations[0].message, /unusedFn/);
});

test("checkReachability flags an export referenced only from test files as test-only-export", () => {
  const a = fileWithCode("src/a.ts", "export function testOnlyFn() {}\n");
  const bTest = fileWithCode("src/b.test.ts", "testOnlyFn();\n", { isTest: true });
  const files = [a, bTest];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "src/a.ts");
  assert.equal(violations[0].rule, "test-only-export");
  assert.equal(violations[0].severity, config.presence["test-only-export"]);
  assert.match(violations[0].message, /testOnlyFn/);
});

test("checkReachability does not flag an export whose only usage is in a manifest file (scene/config wiring)", () => {
  const a = fileWithCode("Scripts/TerminalDisplay.cs", "public class TerminalDisplay {}\n", { lang: "cs" });
  const b = fileWithCode("Scripts/Other.cs", "// unrelated\n", { lang: "cs" });
  const files = [a, b];
  const manifests = [{ rel: "RootScene.tscn", text: '[node name="Term" type="TerminalDisplay"]\n' }];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config, manifests);
  assert.equal(violations.length, 0);
});

test("checkReachability still flags an export mentioned only in a .md file as dead", () => {
  const a = fileWithCode("Scripts/Widget.cs", "public class Widget {}\n", { lang: "cs" });
  const b = fileWithCode("Scripts/Other.cs", "// unrelated\n", { lang: "cs" });
  const files = [a, b];
  // .md is deliberately not a manifest extension. collectManifests never
  // returns it. This simulates the case where reference evidence is absent.
  const manifests = [];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config, manifests);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "dead-export");
  assert.match(violations[0].message, /Widget/);
});

test("checkReachability still flags dead-export when manifests are present but do not mention the symbol", () => {
  const a = fileWithCode("Scripts/Ghost.cs", "public class Ghost {}\n", { lang: "cs" });
  const b = fileWithCode("Scripts/Other.cs", "// unrelated\n", { lang: "cs" });
  const files = [a, b];
  const manifests = [{ rel: "RootScene.tscn", text: '[node name="Unrelated" type="SomethingElse"]\n' }];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config, manifests);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "dead-export");
});

test("checkReachability never reports a manifest file itself as a violation source", () => {
  const a = fileWithCode("Scripts/TerminalDisplay.cs", "public class TerminalDisplay {}\n", { lang: "cs" });
  const files = [a];
  const manifests = [{ rel: "RootScene.tscn", text: '[node name="Term" type="TerminalDisplay"]\n' }];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config, manifests);
  assert.equal(
    violations.some((v) => v.file === "RootScene.tscn"),
    false,
  );
});

test("checkReachability called with no manifests argument behaves exactly as before", () => {
  const a = fileWithCode("src/a.ts", "export function unusedFn() {}\n");
  const b = fileWithCode("src/b.ts", "console.log('nothing to do with it')\n");
  const files = [a, b];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "dead-export");
});

test("checkReachability skips files under isEntryPath and isTest", () => {
  const entry = fileWithCode("src/index.ts", "export function unusedInEntry() {}\n");
  const other = fileWithCode("src/other.ts", "// nothing\n");
  const files = [entry, other];
  const config = buildConfig("default");
  const violations = checkReachability(files, scansFor(files), config);
  assert.equal(violations.length, 0);
});

test("checkDuplication flags an identical six line block appearing in two files", () => {
  const block = ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;", "const f = 6;"];
  const c = { rel: "src/c.ts", lines: [...block] };
  const d = { rel: "src/d.ts", lines: [...block] };
  const config = buildConfig("default");
  const violations = checkDuplication([c, d], config);
  assert.equal(violations.length, 2);
  assert.deepEqual(
    violations.map((v) => v.file).sort(),
    ["src/c.ts", "src/d.ts"],
  );
  for (const violation of violations) {
    assert.equal(violation.rule, "duplicate-block");
    assert.equal(violation.severity, "warn");
    assert.equal(violation.metric, 2);
    assert.equal(violation.line, 1);
  }
});

test("checkDuplication does not flag files with no shared block", () => {
  const c = {
    rel: "src/c.ts",
    lines: ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;", "const f = 6;"],
  };
  const d = {
    rel: "src/d.ts",
    lines: ["let p = 10;", "let q = 20;", "let r = 30;", "let s = 40;", "let t = 50;", "let u = 60;"],
  };
  const config = buildConfig("default");
  const violations = checkDuplication([c, d], config);
  assert.equal(violations.length, 0);
});
