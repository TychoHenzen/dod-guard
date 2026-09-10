import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readSkipLog,
  recordConsumption,
  SKIP_LOG,
  unacknowledged,
} from "./sentinel.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "qg-sentinel-"));
}

test("recordConsumption appends and starts unacknowledged", () => {
  const root = tempRepo();
  recordConsumption(root, {
    file: "src/a.ts",
    reasons: ["complexity: 8 before, 11 now"],
    rebaseline: true,
  });
  recordConsumption(root, {
    file: "src/b.ts",
    reasons: ["file-length"],
    rebaseline: false,
  });
  const log = readSkipLog(root);
  assert.equal(log.length, 2);
  assert.equal(log[0].acknowledged, false);
  assert.match(log[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    JSON.parse(readFileSync(join(root, SKIP_LOG), "utf8")).length,
    2,
  );
  rmSync(root, { recursive: true, force: true });
});

test("unacknowledged reports only records nobody signed off", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", reasons: [] });
  recordConsumption(root, { file: "src/b.ts", reasons: [] });
  const log = readSkipLog(root);
  log[0].acknowledged = true;
  writeFileSync(join(root, SKIP_LOG), JSON.stringify(log, null, 2));
  assert.deepEqual(
    unacknowledged(root).map((item) => item.file),
    ["src/b.ts"],
  );
  rmSync(root, { recursive: true, force: true });
});

test("a corrupt skip log reads as empty rather than throwing", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", reasons: [] });
  writeFileSync(join(root, SKIP_LOG), "{not json");
  assert.deepEqual(readSkipLog(root), []);
  rmSync(root, { recursive: true, force: true });
});
