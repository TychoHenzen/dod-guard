import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { newFileVerdict, ratchetVerdict, rebaselineFile } from "./baseline-gate.mjs";
import { readSkipLog, SENTINEL_NAME } from "./sentinel.mjs";
import { waive } from "./quality-guard.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "qg-gate-"));
}

test("newFileVerdict allows a metric under the generous ceiling", () => {
  // file-length bound is 300, so the new-file ceiling is 450.
  const blocking = newFileVerdict([
    { rule: "file-length", metric: 449, file: "src/a.ts", line: 1, message: "file is 449 lines" },
  ]);
  assert.deepEqual(blocking, []);
});

test("newFileVerdict blocks a metric past the generous ceiling", () => {
  const blocking = newFileVerdict([
    { rule: "file-length", metric: 451, file: "src/a.ts", line: 1, message: "file is 451 lines" },
  ]);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /new-file ceiling 450/);
});

test("newFileVerdict ignores rules that carry no numeric bound", () => {
  const blocking = newFileVerdict([
    { rule: "todo-marker", metric: 99, file: "src/a.ts", line: 3, message: "TODO left behind" },
    { rule: "complexity", file: "src/a.ts", line: 4, message: "no metric reported" },
  ]);
  assert.deepEqual(blocking, []);
});

test("ratchetVerdict reports only regressions belonging to the scanned file", () => {
  const comparison = {
    regressions: [
      { file: "src/a.ts", rule: "complexity", before: 8, now: 11 },
      { file: "src/other.ts", rule: "complexity", before: 1, now: 4 },
    ],
  };
  const violations = [{ rule: "complexity", file: "src/a.ts", line: 12, message: "complexity 11" }];

  const blocking = ratchetVerdict(comparison, "src/a.ts", violations);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /complexity: 8 before, 11 now/);
  assert.match(blocking[0], /src\/a\.ts:12/);
});

test("ratchetVerdict is empty when the file did not get worse", () => {
  const comparison = { regressions: [{ file: "src/other.ts", rule: "complexity", before: 1, now: 4 }] };
  assert.deepEqual(ratchetVerdict(comparison, "src/a.ts", []), []);
});

test("rebaselineFile drops stale rows so a fixed rule leaves no loose bar", () => {
  const baseline = {
    version: 2,
    total: 5,
    files: ["src/a.ts", "src/b.ts"],
    counts: { "src/a.ts::complexity": 3, "src/a.ts::todo-marker": 1, "src/b.ts::complexity": 1 },
  };
  const violations = [{ file: "src/a.ts", rule: "complexity" }, { file: "src/a.ts", rule: "complexity" }];

  const next = rebaselineFile(baseline, violations, "src/a.ts");
  assert.equal(next.counts["src/a.ts::complexity"], 2, "count must follow the current scan");
  assert.equal("src/a.ts::todo-marker" in next.counts, false, "a rule that stopped firing must be dropped");
  assert.equal(next.counts["src/b.ts::complexity"], 1, "other files must be untouched");
  assert.equal(next.total, 3);
});

test("rebaselineFile records a file the baseline had never seen", () => {
  const baseline = { version: 2, total: 0, files: ["src/b.ts"], counts: {} };
  const next = rebaselineFile(baseline, [{ file: "src/new.ts", rule: "complexity" }], "src/new.ts");
  assert.deepEqual(next.files, ["src/b.ts", "src/new.ts"]);
  assert.equal(next.counts["src/new.ts::complexity"], 1);
});

test("rebaselineFile keeps a clean file in the list with no rows", () => {
  const baseline = { version: 2, total: 1, files: [], counts: { "src/a.ts::complexity": 1 } };
  const next = rebaselineFile(baseline, [], "src/a.ts");
  assert.deepEqual(next.files, ["src/a.ts"]);
  assert.equal(next.total, 0);
});

test("no sentinel waives nothing", () => {
  const root = tempRepo();
  assert.equal(waive(root, null, { isNew: true, record: { file: "src/a.ts", reasons: [] } }), false);
  rmSync(root, { recursive: true, force: true });
});

test("a plain sentinel waives the new-file ceiling", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "");
  const waived = waive(root, { rebaseline: false }, { isNew: true, record: { file: "src/a.ts", reasons: ["big"] } });

  assert.equal(waived, true);
  assert.equal(existsSync(join(root, SENTINEL_NAME)), false, "the sentinel must be consumed");
  const log = readSkipLog(root);
  assert.equal(log.length, 1);
  assert.equal(log[0].rebaseline, false);
  assert.equal(log[0].acknowledged, false);
  rmSync(root, { recursive: true, force: true });
});

test("a plain sentinel does NOT waive a tracked-file regression", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "");
  const waived = waive(root, { rebaseline: false }, { isNew: false, record: { file: "src/a.ts", reasons: ["worse"] } });

  assert.equal(waived, false, "narrow scope: raising a tracked bar needs an explicit rebaseline");
  assert.equal(existsSync(join(root, SENTINEL_NAME)), true, "an unused sentinel must not be consumed");
  assert.deepEqual(readSkipLog(root), [], "nothing was waived, so nothing is logged");
  rmSync(root, { recursive: true, force: true });
});

test("a rebaseline sentinel waives a tracked-file regression and logs it", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), '{"rebaseline": true}');
  const record = { file: "src/a.ts", reasons: ["complexity: 8 before, 11 now"] };
  const waived = waive(root, { rebaseline: true }, { isNew: false, record });

  assert.equal(waived, true);
  assert.equal(existsSync(join(root, SENTINEL_NAME)), false);
  const log = readSkipLog(root);
  assert.equal(log.length, 1);
  assert.equal(log[0].file, "src/a.ts");
  assert.equal(log[0].rebaseline, true);
  assert.equal(log[0].acknowledged, false, "the pre-commit hook must still see this");
  assert.deepEqual(log[0].reasons, ["complexity: 8 before, 11 now"]);
  rmSync(root, { recursive: true, force: true });
});
