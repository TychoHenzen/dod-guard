import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  deleteSentinel,
  readSentinel,
  readSkipLog,
  recordConsumption,
  SENTINEL_NAME,
  SKIP_LOG,
  unacknowledged,
} from "./sentinel.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "qg-sentinel-"));
}

test("readSentinel returns null when no sentinel is present", () => {
  const root = tempRepo();
  assert.equal(readSentinel(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("an empty sentinel is the plain waiver, not a rebaseline", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "");
  assert.deepEqual(readSentinel(root), { rebaseline: false });
  rmSync(root, { recursive: true, force: true });
});

test("rebaseline is honoured only when explicitly true", () => {
  const root = tempRepo();
  const path = join(root, SENTINEL_NAME);

  writeFileSync(path, '{"rebaseline": true}');
  assert.equal(readSentinel(root).rebaseline, true);

  writeFileSync(path, '{"rebaseline": false}');
  assert.equal(readSentinel(root).rebaseline, false);

  writeFileSync(path, '{"rebaseline": "yes"}');
  assert.equal(readSentinel(root).rebaseline, false, "a truthy string must not authorise a raise");

  rmSync(root, { recursive: true, force: true });
});

test("unparseable sentinel content degrades to the plain waiver", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "{not json");
  assert.deepEqual(readSentinel(root), { rebaseline: false });
  rmSync(root, { recursive: true, force: true });
});

test("deleteSentinel removes the file so the waiver cannot stay switched on", () => {
  const root = tempRepo();
  const path = join(root, SENTINEL_NAME);
  writeFileSync(path, "");
  deleteSentinel(root);
  assert.equal(existsSync(path), false);
  rmSync(root, { recursive: true, force: true });
});

test("deleteSentinel on a missing file does not throw", () => {
  const root = tempRepo();
  assert.doesNotThrow(() => deleteSentinel(root));
  rmSync(root, { recursive: true, force: true });
});

test("recordConsumption appends and starts unacknowledged", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", reasons: ["complexity: 8 before, 11 now"], rebaseline: true });
  recordConsumption(root, { file: "src/b.ts", reasons: ["file-length"], rebaseline: false });

  const log = readSkipLog(root);
  assert.equal(log.length, 2, "the second record must append, not replace");
  assert.equal(log[0].file, "src/a.ts");
  assert.equal(log[0].rebaseline, true);
  assert.equal(log[0].acknowledged, false);
  assert.match(log[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(log[1].file, "src/b.ts");

  const onDisk = JSON.parse(readFileSync(join(root, SKIP_LOG), "utf8"));
  assert.equal(onDisk.length, 2, "the log must survive on disk for the pre-commit hook");
  rmSync(root, { recursive: true, force: true });
});

test("unacknowledged reports only records nobody signed off", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", reasons: [] });
  recordConsumption(root, { file: "src/b.ts", reasons: [] });

  const log = readSkipLog(root);
  log[0].acknowledged = true;
  writeFileSync(join(root, SKIP_LOG), JSON.stringify(log, null, 2));

  const open = unacknowledged(root);
  assert.equal(open.length, 1);
  assert.equal(open[0].file, "src/b.ts");
  rmSync(root, { recursive: true, force: true });
});

test("a corrupt skip log reads as empty rather than throwing", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", reasons: [] });
  writeFileSync(join(root, SKIP_LOG), "{not json");
  assert.deepEqual(readSkipLog(root), []);
  rmSync(root, { recursive: true, force: true });
});
