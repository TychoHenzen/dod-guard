import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { scanMarkers } from "./markers.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-markers-"));

  const testFile = path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts");
  await fs.mkdir(path.dirname(testFile), { recursive: true });
  await fs.writeFile(
    testFile,
    [
      'import { test } from "node:test";',
      "",
      "// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: unwired",
      'test("cover reports a scenario with no bound test as unwired", async () => {});',
      "",
      "// covers: dod-guard/coverage-gate :: cover reports a scenario's state :: covered",
      "",
      'it("cover reports a bound scenario as covered", async () => {});',
      "",
      "// covers: dod-guard/coverage-gate :: a marker with nothing after it :: dangling",
      "",
    ].join("\n"),
  );
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

// covers: dod-guard/coverage-gate :: A scenario binds to a test through a marker in the test file :: A test file carries a covers marker above a test call
test("scanMarkers binds a scenario to the test on the very next line", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  const binding = bindings.get("dod-guard/coverage-gate::cover reports a scenario's state||unwired");
  assert.ok(binding);
  assert.equal(binding.testName, "cover reports a scenario with no bound test as unwired");
});

test("scanMarkers skips blank lines between the marker and an it() call", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  const binding = bindings.get("dod-guard/coverage-gate::cover reports a scenario's state||covered");
  assert.ok(binding);
  assert.equal(binding.testName, "cover reports a bound scenario as covered");
});

test("scanMarkers binds a TypeScript marker to its named test", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  const binding = bindings.get("dod-guard/coverage-gate::cover reports a scenario's state||unwired");
  assert.ok(binding);
  assert.equal(binding.file, path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts"));
  assert.equal(binding.testName, "cover reports a scenario with no bound test as unwired");
});

// covers: dod-guard/coverage-gate :: A scenario binds to a test through a marker in the test file :: A marker with no test call after it binds nothing
test("scanMarkers drops a marker with no test call after it", async () => {
  const bindings = await scanMarkers(cwd, "dod-guard");
  assert.equal(bindings.has("dod-guard/coverage-gate::a marker with nothing after it||dangling"), false);
});

test("scanMarkers returns an empty map when no test files exist", async () => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-empty-"));
  try {
    const bindings = await scanMarkers(emptyDir, "anything");
    assert.equal(bindings.size, 0);
  } finally {
    await fs.rm(emptyDir, { recursive: true, force: true });
  }
});

test("scanMarkers binds both .ts and .py files when test-globs.json provides the Python globs", async () => {
  const pyDir = path.join(cwd, "tests", "eval");
  await fs.mkdir(pyDir, { recursive: true });
  await fs.writeFile(
    path.join(pyDir, "test_events.py"),
    [
      "# covers: eval/events :: frozen :: difficulty defaults",
      "def test_probe_truth_difficulty():",
      "    assert True",
    ].join("\n"),
  );
  const globsDir = path.join(cwd, "openspec");
  await fs.mkdir(globsDir, { recursive: true });
  await fs.writeFile(path.join(globsDir, "test-globs.json"), JSON.stringify({ eval: ["tests/eval/**/*.py"] }));
  const bindings = await scanMarkers(cwd, "eval");
  const binding = bindings.get("eval/events::frozen||difficulty defaults");
  assert.ok(binding, "Python marker should bind");
  assert.equal(binding.testName, "test_probe_truth_difficulty");
});
