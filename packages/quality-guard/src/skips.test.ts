import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { SKIP_LOG as HOOK_SKIP_LOG } from "../scripts/sentinel.mjs";
import { formatSkips, readSkipLog, SKIP_LOG, type SkipRecord } from "./skips.js";

function writeLog(root: string, records: SkipRecord[]): void {
  mkdirSync(path.join(root, path.dirname(SKIP_LOG)), { recursive: true });
  writeFileSync(path.join(root, SKIP_LOG), JSON.stringify(records, null, 2));
}
test("the server and the hook agree on where the skip log lives", () => {
  assert.equal(SKIP_LOG, HOOK_SKIP_LOG, "a drift here would hide waivers from quality_skips");
});

test("readSkipLog returns empty for a repo that never waived anything", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qg-skips-"));
  assert.deepEqual(readSkipLog(root), []);
  rmSync(root, { recursive: true, force: true });
});

test("readSkipLog reads records the hook wrote", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qg-skips-"));
  writeLog(root, [{ file: "src/a.ts", rebaseline: true, at: "2026-07-30T09:00:00.000Z", acknowledged: false }]);

  const log = readSkipLog(root);
  assert.equal(log.length, 1);
  assert.equal(log[0].file, "src/a.ts");
  assert.equal(log[0].rebaseline, true);
  rmSync(root, { recursive: true, force: true });
});
test("a corrupt log reads as empty rather than throwing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qg-skips-"));
  mkdirSync(path.join(root, path.dirname(SKIP_LOG)), { recursive: true });
  writeFileSync(path.join(root, SKIP_LOG), "{not json");
  assert.deepEqual(readSkipLog(root), []);
  rmSync(root, { recursive: true, force: true });
});
test("formatSkips reports nothing open when every waiver is acknowledged", () => {
  const out = formatSkips([{ file: "src/a.ts", acknowledged: true }]);
  assert.equal(out, "No unacknowledged quality-gate waivers.");
});
test("formatSkips lists open waivers with their kind and reasons", () => {
  const out = formatSkips([
    { file: "src/a.ts", rebaseline: true, at: "2026-07-30T09:00:00.000Z", reasons: ["complexity: 8 before, 11 now"] },
    { file: "src/b.ts", rebaseline: false, at: "2026-07-30T10:00:00.000Z" },
    { file: "src/done.ts", acknowledged: true },
  ]);

  assert.match(out, /^2 unacknowledged waiver\(s\):/);
  assert.match(out, /src\/a\.ts {2}\[rebaseline\] {2}2026-07-30T09:00:00\.000Z/);
  assert.match(out, /complexity: 8 before, 11 now/);
  assert.match(out, /src\/b\.ts {2}\[new-file ceiling\]/);
  assert.equal(out.includes("src/done.ts"), false, "acknowledged waivers must not be listed");
});

test("formatSkips indents every line of a multi-line reason", () => {
  const out = formatSkips([
    { file: "src/a.ts", reasons: ["complexity: 8 before, 11 now\n  src/a.ts:12: too complex"] },
  ]);
  assert.match(out, /\n {4}complexity: 8 before, 11 now\n {4} {2}src\/a\.ts:12: too complex/);
});
