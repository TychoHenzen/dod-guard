import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkReachability } from "./reachability.js";

// Real c8, real node, real subprocesses - these are slow (subprocess spin-up
// per case) and deliberately exercise the exact invocation shape that broke
// under shell:true (see reachability.ts's header comment). The fixture lives
// under tools/openspec-dashboard, the one group with no src/dist split, so no
// tsc build step is needed to make it runnable.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "tools", "openspec-dashboard", "__cover_reachability_fixture__");
const ENTRY_FILE = path.join(FIXTURE_DIR, "entry.js");
const TEST_FILE = path.join(FIXTURE_DIR, "sample.test.js");

before(async () => {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(ENTRY_FILE, "export function reached() {\n  return true;\n}\n");
  await fs.writeFile(
    TEST_FILE,
    [
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      'import { reached } from "./entry.js";',
      "",
      'test("touches the entry point", () => {',
      "  assert.equal(reached(), true);",
      "});",
      "",
      'test("never touches the entry point", () => {',
      "  assert.equal(1 + 1, 2);",
      "});",
      "",
      'test("fails on purpose", () => {',
      "  assert.equal(1, 2);",
      "});",
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
});

test("reports covered-and-integrated when the bound test reaches a declared entry point", async () => {
  const result = await checkReachability({
    cwd: REPO_ROOT,
    group: "openspec-dashboard",
    testName: "touches the entry point",
    testFile: TEST_FILE,
    entryPointFiles: [path.relative(REPO_ROOT, ENTRY_FILE).split(path.sep).join("/")],
  });
  assert.equal(result.outcome, "covered-and-integrated");
});

test("reports covered-but-not-integrated when the bound test never reaches a declared entry point", async () => {
  const result = await checkReachability({
    cwd: REPO_ROOT,
    group: "openspec-dashboard",
    testName: "never touches the entry point",
    testFile: TEST_FILE,
    entryPointFiles: [path.relative(REPO_ROOT, ENTRY_FILE).split(path.sep).join("/")],
  });
  assert.equal(result.outcome, "covered-but-not-integrated");
});

test("reports covered-but-not-integrated with a reason when no entry points are declared", async () => {
  const result = await checkReachability({
    cwd: REPO_ROOT,
    group: "openspec-dashboard",
    testName: "touches the entry point",
    testFile: TEST_FILE,
    entryPointFiles: [],
  });
  assert.equal(result.outcome, "covered-but-not-integrated");
  assert.match(result.note, /no entry points declared/);
});

test("reports failed when the bound test fails", async () => {
  const result = await checkReachability({
    cwd: REPO_ROOT,
    group: "openspec-dashboard",
    testName: "fails on purpose",
    testFile: TEST_FILE,
    entryPointFiles: [],
  });
  assert.equal(result.outcome, "failed");
});

test("reports failed when no test matches the given name", async () => {
  const result = await checkReachability({
    cwd: REPO_ROOT,
    group: "openspec-dashboard",
    testName: "this test name does not exist anywhere",
    testFile: TEST_FILE,
    entryPointFiles: [],
  });
  assert.equal(result.outcome, "failed");
  assert.match(result.note, /no test named/);
});
