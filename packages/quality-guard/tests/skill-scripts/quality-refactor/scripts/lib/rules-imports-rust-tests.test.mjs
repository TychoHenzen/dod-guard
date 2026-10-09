import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { checkWildcardImports } from "../../../../../skills/quality-refactor/scripts/lib/rules-project.mjs";
import {
  fileWithCode,
  rustFile,
  rustScansFor,
} from "./rules-project-fixtures.test.mjs";

function wildcardsFor(files) {
  return checkWildcardImports({
    files,
    scans: rustScansFor(files),
    config: buildConfig(),
  });
}

test("a glob import of the parent inside a Rust test module is quiet", () => {
  const code = [
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    "#[cfg(test)]",
    "mod tests {",
    "    use super::*;",
    "    #[test]",
    "    fn it_works() { assert_eq!(tally(&[]), 0); }",
    "}",
  ].join("\n");
  assert.deepEqual(wildcardsFor([rustFile("src/stats.rs", code)]), []);
});

test("a glob import outside any test region is still reported", () => {
  const code = [
    "use super::*;",
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
  ].join("\n");
  assert.deepEqual(wildcardsFor([rustFile("src/stats.rs", code)]), [
    {
      file: "src/stats.rs",
      line: 1,
      rule: "wildcard-import",
      severity: "medium",
      message:
        "super wildcard import obscures its imported API; import explicit names instead",
      suggestion: "Import explicit names from super.",
      metric: 1,
    },
  ]);
});

test("only the top-level glob import is reported when a test module also globs", () => {
  const code = [
    "use crate::items::*;",
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    "#[cfg(test)]",
    "mod tests {",
    "    use super::*;",
    "    #[test]",
    "    fn it_works() {}",
    "}",
  ].join("\n");
  const found = wildcardsFor([rustFile("src/stats.rs", code)]);
  assert.deepEqual(
    found.map((item) => [item.line, item.suggestion]),
    [[1, "Import explicit names from crate::items."]],
  );
});

test("a cfg(all(test, ...)) module counts as a Rust test region", () => {
  const code = [
    '#[cfg(all(test, feature = "x"))]',
    "mod tests {",
    "    use super::*;",
    "    #[test]",
    "    fn it_works() {}",
    "}",
  ].join("\n");
  assert.deepEqual(wildcardsFor([rustFile("src/stats.rs", code)]), []);
});

test("a Python star import is still reported at medium severity", () => {
  const files = [
    fileWithCode("src/wild.py", "from module import *\n", { lang: "py" }),
  ];
  assert.deepEqual(wildcardsFor(files), [
    {
      file: "src/wild.py",
      line: 1,
      rule: "wildcard-import",
      severity: "medium",
      message:
        "module wildcard import obscures its imported API; import explicit names instead",
      suggestion: "Import explicit names from module.",
      metric: 1,
    },
  ]);
});
