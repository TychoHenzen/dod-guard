import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { checkReachability } from "./rules-project.mjs";
import { rustFile, rustScansFor } from "./rules-project-fixtures.test.mjs";

function reachable(files) {
  const config = buildConfig("default");
  return checkReachability({
    files,
    scans: rustScansFor(files, config),
    config,
  });
}

test("a Rust symbol referenced only from cfg(test) is test-only-export", () => {
  const code = [
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    "#[cfg(test)]",
    "mod tests {",
    "    #[test]",
    "    fn it_works() { assert_eq!(tally(&[]), 0); }",
    "}",
  ].join("\n");
  const found = reachable([rustFile("src/stats.rs", code)]);
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "test-only-export");
  assert.match(found[0].message, /tally/);
});

test("a Rust symbol also used by production stays reachable", () => {
  const code = [
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    "pub fn run() -> u32 { tally(&[1, 2, 3]) }",
    "#[cfg(test)]",
    "mod tests { #[test] fn it_works() { assert_eq!(tally(&[]), 0); } }",
  ].join("\n");
  const found = reachable([rustFile("src/stats.rs", code)]);
  assert.equal(
    found.some((violation) => violation.message.includes("tally")),
    false,
  );
});

test(
  "a Rust pub fn read only from another file's format capture is reachable",
  () => {
  const files = [
    rustFile(
      "src/stats.rs",
      "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    ),
    rustFile(
      "src/report.rs",
      'pub fn show(total: u32) { println!("{tally}"); }',
    ),
  ];
  const found = reachable(files);
  assert.equal(
    found.some((violation) => violation.message.includes("tally")),
    false,
  );
});
