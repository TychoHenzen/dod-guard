import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { runScan, type ScanRequest } from "./scanner.js";

function captureArgs(request: ScanRequest): string[] {
  let captured: string[] = [];
  runScan(request, ((_command: string, args: string[]) => {
    captured = args;
    return JSON.stringify({ summary: { total: 0 }, violations: [] });
  }) as never);
  return captured;
}

test("scannerPath points at the scanner that ships in the skill", () => {
  const target = captureArgs({ paths: ["src"] })[0] ?? "";
  assert.match(
    target.split("\\").join("/"),
    /skills\/quality-refactor\/scripts\/quality-scan\.mjs$/,
  );
  assert.equal(
    existsSync(target),
    true,
    "the bundled server must be able to reach the scanner",
  );
});

test("buildArgs always asks for JSON and keeps the paths first", () => {
  assert.deepEqual(captureArgs({ paths: ["src", "lib"] }).slice(1), [
    "src",
    "lib",
    "--format=json",
  ]);
});

test("buildArgs repeats excludes and test paths", () => {
  const args = captureArgs({
    paths: ["."],
    excludes: ["/dist/", "node_modules"],
    testPaths: ["Scenario/", "harness/"],
  }).slice(1);
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
  const args = captureArgs({
    paths: ["packages"],
    root: "/repo",
    profile: "strict",
    rules: ["complexity", "file-length"],
    baseline: ".github/quality/quality-baseline.json",
    failOn: "regression",
  }).slice(1);
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
  const args = captureArgs({ paths: ["src"] }).slice(1);
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
