import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_PATHS,
  isGenerated,
  normalizePath,
  parseNameStatus,
} from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-paths.mjs";
import { parseArgs } from "../../../../../skills/quality-refactor/scripts/quality-pr-gate.mjs";

const required = ["--base=main", "--root=Scripts"];

test("normalizePath makes Windows and dot-relative paths comparable", () => {
  assert.equal(
    normalizePath("packages\\quality-guard\\a.mjs"),
    "packages/quality-guard/a.mjs",
  );
  assert.equal(normalizePath("./packages/a.mjs"), "packages/a.mjs");
});

test("generated output is recognised by path fragment", () => {
  assert.equal(isGenerated("packages/code-explorer/dist-test/src/a.js"), true);
  assert.equal(isGenerated("packages/code-explorer/dist/src/a.js"), true);
  assert.equal(isGenerated("node_modules/x/index.js"), true);
  assert.equal(isGenerated("packages/code-explorer/src/a.ts"), false);
  assert.ok(GENERATED_PATHS.includes("/dist-test/"));
});

test("parseNameStatus maps each changed file to where it lived at the merge base", () => {
  const rows = ["M\tsrc\\a.cs", "A\tsrc/b.cs", "R087\tsrc/old.cs\tsrc/new.cs", "C100\tsrc/orig.cs\tsrc/copy.cs", ""];
  assert.deepEqual(parseNameStatus(rows.join("\n")), [
    { path: "src/a.cs", basePath: "src/a.cs" },
    { path: "src/b.cs", basePath: null },
    { path: "src/new.cs", basePath: "src/old.cs" },
    { path: "src/copy.cs", basePath: "src/orig.cs" },
  ]);
});

test("parseArgs requires a base ref and at least one root", () => {
  assert.match(parseArgs([]).error, /--base/);
  assert.match(parseArgs(["--base=main"]).error, /--root/);
  assert.equal(parseArgs(["--base=main", "--root=packages"]).error, undefined);
  assert.match(parseArgs(["--bogus"]).error, /unknown argument/);
});

test("parseArgs keeps every root and exclude, plus the generated defaults", () => {
  const options = parseArgs(["--base=main", "--root=Scripts", "--root=addons", "--exclude=/gen/"]);
  assert.deepEqual(options.roots, ["Scripts", "addons"]);
  assert.ok(options.excludes.includes("/gen/"));
  assert.ok(options.excludes.includes("/dist-test/"));
});

test("parseArgs defaults to blocking new medium findings with a 1 medium/high or 3 low quota", () => {
  const options = parseArgs(required);
  assert.equal(options.blockOn, "medium");
  assert.equal(options.fixMediumHigh, 1);
  assert.equal(options.fixLow, 3);
});

test("parseArgs accepts the policy and output flags", () => {
  const options = parseArgs([
    ...required,
    "--block-on=high",
    "--fix-medium-high=2",
    "--fix-low=4",
    "--report=out/report.md",
    "--comment=out/comment.md",
    "--report-link=https://example.test/run/1",
  ]);
  assert.equal(options.error, undefined);
  assert.equal(options.blockOn, "high");
  assert.equal(options.fixMediumHigh, 2);
  assert.equal(options.fixLow, 4);
  assert.equal(options.report, "out/report.md");
  assert.equal(options.comment, "out/comment.md");
  assert.equal(options.reportLink, "https://example.test/run/1");
});

test("parseArgs rejects bad policy values", () => {
  assert.match(parseArgs([...required, "--block-on=severe"]).error, /--block-on/);
  assert.match(parseArgs([...required, "--fix-low=many"]).error, /whole number/);
});

test("parseArgs collects per-rule blocking thresholds and rejects malformed ones", () => {
  const options = parseArgs([...required, "--rule-block-on=line-length:high"]);
  assert.equal(options.error, undefined);
  assert.deepEqual(options.ruleBlockOn, { "line-length": "high" });
  assert.match(parseArgs([...required, "--rule-block-on=line-length"]).error, /--rule-block-on/);
  assert.match(parseArgs([...required, "--rule-block-on=line-length:loud"]).error, /--rule-block-on/);
});
