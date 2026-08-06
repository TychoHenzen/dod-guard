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
import { scanFile } from "./rules-file.mjs";
import { checkDuplication, checkReachability } from "./rules-project.mjs";

function fileWithCode(rel, code, { isTest = false, lang = "ts" } = {}) {
  return { rel, lang, isTest, source: code, lines: code.split("\n") };
}

function scansFor(files) {
  const scans = new Map();
  for (const file of files) scans.set(file.rel, { code: file.source, starts: lineIndex(file.source) });
  return scans;
}

function rustFile(rel, code) {
  return { rel, lang: "rs", isTest: false, source: code, lines: code.split("\n") };
}

/**
 * Real `scanFile` output, not the hand-built `scansFor` shape - Rust's
 * reachability split needs `testRegions`, which only `scanFile` computes.
 */
function rustScansFor(files, config) {
  const scans = new Map();
  for (const file of files) scans.set(file.rel, scanFile(file, config));
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

test("checkReachability reports a Rust symbol referenced only from its own #[cfg(test)] module as test-only-export", () => {
  // "lib.rs" is deliberately avoided - isEntryPath treats it as an entry
  // point and would skip the file before reachability ever runs.
  const code = `
pub fn tally(items: &[u32]) -> u32 {
    items.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        assert_eq!(tally(&[]), 0);
    }
}
`;
  const files = [rustFile("src/stats.rs", code)];
  const config = buildConfig("default");
  const violations = checkReachability(files, rustScansFor(files, config), config);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "test-only-export");
  assert.match(violations[0].message, /tally/);
});

test("checkReachability stays silent on a Rust symbol also referenced from production code in the same file", () => {
  const code = `
pub fn tally(items: &[u32]) -> u32 {
    items.iter().sum()
}

pub fn run() -> u32 {
    tally(&[1, 2, 3])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        assert_eq!(tally(&[]), 0);
    }
}
`;
  const files = [rustFile("src/stats.rs", code)];
  const config = buildConfig("default");
  const violations = checkReachability(files, rustScansFor(files, config), config);
  assert.equal(
    violations.some((v) => v.message.includes("tally")),
    false,
  );
});

test("checkReachability does not flag a Rust pub fn read only inside another file's format capture", () => {
  const a = rustFile(
    "src/stats.rs",
    `
pub fn tally(items: &[u32]) -> u32 {
    items.iter().sum()
}
`,
  );
  const b = rustFile(
    "src/report.rs",
    `
pub fn show(total: u32) {
    println!("{tally}");
}
`,
  );
  const files = [a, b];
  const config = buildConfig("default");
  // Before the fix, \`tally\` never appeared in src/report.rs's stripped
  // code stream - the capture reading it lives entirely inside a blanked
  // string literal - so referenceCounts saw no production caller anywhere
  // and reported it dead.
  const violations = checkReachability(files, rustScansFor(files, config), config);
  assert.equal(
    violations.some((v) => v.message.includes("tally")),
    false,
  );
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

test("checkDuplication ignores a shared import block", () => {
  const imports = [
    'import { a } from "./a.js";',
    'import { b } from "./b.js";',
    'import { c } from "./c.js";',
    'import { d } from "./d.js";',
    'export { e } from "./e.js";',
    'export { f } from "./f.js";',
  ];
  const c = { rel: "src/c.ts", lines: [...imports, "const one = 1;"] };
  const d = { rel: "src/d.ts", lines: [...imports, "const two = 2;"] };
  const config = buildConfig("default");
  assert.equal(checkDuplication([c, d], config).length, 0);
});

test("checkDuplication still flags shared code that sits under shared imports", () => {
  const shared = [
    'import { a } from "./a.js";',
    "const one = 1;",
    "const two = 2;",
    "const three = 3;",
    "const four = 4;",
    "const five = 5;",
    "const six = 6;",
  ];
  const c = { rel: "src/c.ts", lines: [...shared] };
  const d = { rel: "src/d.ts", lines: [...shared] };
  const config = buildConfig("default");
  assert.equal(checkDuplication([c, d], config).length, 2);
});
