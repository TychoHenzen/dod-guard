import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkWildcardImports } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import { csFile, rustFile, tsFile } from "./rules-file-fixtures.test.mjs";
import { rustScansFor } from "./rules-project-fixtures.test.mjs";

// rules-file-fixtures.test.mjs has no Python or Java builder.
const fileOf = (lang) => (rel, code) => ({
  rel,
  lang,
  isTest: false,
  source: code,
  lines: code.split("\n"),
});
const pyFile = fileOf("py");
const javaFile = fileOf("java");

const src = (...rows) => rows.join("\n");
const where = (found) => found.map((v) => [v.file, v.line, v.rule, v.severity]);

// The project check the CLI runs, with scans built the way scanFile builds them.
function wildcardsFor(files) {
  return checkWildcardImports({
    files,
    scans: rustScansFor(files),
    config: buildConfig(),
  });
}

const TEST_MODULE = src(
  "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
  // biome-ignore lint/security/noSecrets: Rust attribute text, not a credential
  "#[cfg(test)]",
  "mod tests {",
  "    use super::*;",
  "    #[test]",
  "    fn it_works() {}",
  "}",
);

test("py: from module import * is one wildcard-import finding", () => {
  const found = wildcardsFor([pyFile("src/wild.py", "from module import *\n")]);
  assert.deepEqual(where(found), [
    ["src/wild.py", 1, "wildcard-import", "medium"],
  ]);
});

test("rs: a top-level use crate::items::* is one wildcard-import finding", () => {
  const code = src("use crate::items::*;", "pub fn tally() -> u32 { 0 }");
  assert.deepEqual(where(wildcardsFor([rustFile("src/tally.rs", code)])), [
    ["src/tally.rs", 1, "wildcard-import", "medium"],
  ]);
});

test("py: an explicit from-import is quiet", () => {
  const file = pyFile("src/explicit.py", "from module import name\n");
  assert.deepEqual(wildcardsFor([file]), []);
});

test("rs: an explicit use is quiet", () => {
  const code = src("use std::collections::HashMap;", "pub fn tally() {}");
  assert.deepEqual(wildcardsFor([rustFile("src/tally.rs", code)]), []);
});

test("rs: use super::* inside a #[cfg(test)] module is quiet", () => {
  assert.deepEqual(wildcardsFor([rustFile("src/stats.rs", TEST_MODULE)]), []);
  // Control: the same glob outside a test region is still reported.
  // biome-ignore lint/security/noSecrets: Rust attribute text, not a credential
  const outside = TEST_MODULE.replace("#[cfg(test)]\n", "");
  assert.equal(wildcardsFor([rustFile("src/stats.rs", outside)]).length, 1);
});

test("unsupported wildcard forms are quiet: TypeScript, Java, and C#", () => {
  const forms = [
    tsFile(
      "src/ns.ts",
      src('import * as ns from "./mod";', "export const v = ns;"),
    ),
    tsFile("src/reexport.ts", 'export * from "./mod";'),
    javaFile("src/Calc.java", src("import java.util.*;", "class Calc {}")),
    csFile("src/Calc.cs", src("using System;", "class Calc {}")),
  ];
  for (const file of forms) {
    assert.deepEqual(wildcardsFor([file]), [], `${file.rel} must stay quiet`);
  }
});
