import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { buildArgs, runScan, scannerPath } from "./scanner.js";

test("scannerPath points at the scanner that ships in the skill", () => {
  const target = scannerPath();
  assert.match(target.split("\\").join("/"), /skills\/quality-refactor\/scripts\/quality-scan\.mjs$/);
  assert.equal(existsSync(target), true, "the bundled server must be able to reach the scanner");
});

test("buildArgs always asks for JSON and keeps the paths first", () => {
  assert.deepEqual(buildArgs({ paths: ["src", "lib"] }), ["src", "lib", "--format=json"]);
});

test("buildArgs repeats excludes and test paths", () => {
  const args = buildArgs({ paths: ["."], excludes: ["/dist/", "node_modules"], testPaths: ["Scenario/", "harness/"] });
  assert.deepEqual(args, [
    ".",
    "--format=json",
    "--exclude=/dist/",
    "--exclude=node_modules",
    "--test-path=Scenario/",
    "--test-path=harness/",
  ]);
});

test("buildArgs passes the gate options through", () => {
  const args = buildArgs({
    paths: ["packages"],
    root: "/repo",
    profile: "strict",
    rules: ["complexity", "file-length"],
    baseline: ".github/quality/quality-baseline.json",
    failOn: "regression",
  });
  assert.deepEqual(args, [
    "packages",
    "--format=json",
    "--root=/repo",
    "--profile=strict",
    "--rules=complexity,file-length",
    "--baseline=.github/quality/quality-baseline.json",
    "--fail-on=regression",
  ]);
});

test("buildArgs omits every flag the caller did not set", () => {
  const args = buildArgs({ paths: ["src"] });
  assert.equal(
    args.some((arg) => arg.startsWith("--root=")),
    false,
  );
  assert.equal(
    args.some((arg) => arg.startsWith("--fail-on=")),
    false,
  );
  assert.equal(
    args.some((arg) => arg.startsWith("--baseline=")),
    false,
  );
});

// covers: quality-guard/mcp-tools :: Scan reports without judging :: Scan a directory
test("runScan parses the scanner report on success", () => {
  const fake = () => JSON.stringify({ summary: { total: 0 }, violations: [] });
  const result = runScan({ paths: ["src"] }, fake as never);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report, { summary: { total: 0 }, violations: [] });
});

// covers: quality-guard/mcp-tools :: A failed scan is reported, not thrown :: Scanner exits non-zero with a report
test("runScan treats a non-zero exit as a verdict, not a crash", () => {
  const fake = () => {
    const err = new Error("Command failed") as Error & { status: number; stdout: string };
    err.status = 1;
    err.stdout = JSON.stringify({ comparison: { regressions: [{ file: "a.ts" }] } });
    throw err;
  };
  const result = runScan({ paths: ["src"], failOn: "regression" }, fake as never);
  assert.equal(result.exitCode, 1, "a failed gate must still return its report");
  assert.deepEqual(result.report, { comparison: { regressions: [{ file: "a.ts" }] } });
});

// covers: quality-guard/mcp-tools :: A failed scan is reported, not thrown :: Scanner cannot start
test("runScan throws when the scanner produced no report at all", () => {
  const fake = () => {
    throw new Error("spawn ENOENT");
  };
  assert.throws(() => runScan({ paths: ["src"] }, fake as never), /quality scan failed: spawn ENOENT/);
});
