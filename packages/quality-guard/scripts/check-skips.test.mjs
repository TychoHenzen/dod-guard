import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { main, renderOpen } from "./check-skips.mjs";
import { recordConsumption, SKIP_LOG } from "./sentinel.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "qg-check-"));
}

test("a repo that never waived anything passes", () => {
  const root = tempRepo();
  assert.equal(main(root), 0);
  rmSync(root, { recursive: true, force: true });
});

test("an open waiver fails the check", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", rebaseline: true, reasons: ["complexity: 8 before, 11 now"] });
  assert.equal(main(root), 1, "an unacknowledged waiver must block the commit");
  rmSync(root, { recursive: true, force: true });
});

test("acknowledging every waiver clears the check", () => {
  const root = tempRepo();
  recordConsumption(root, { file: "src/a.ts", rebaseline: true });
  recordConsumption(root, { file: "src/b.ts", rebaseline: false });

  const path = join(root, SKIP_LOG);
  mkdirSync(dirname(path), { recursive: true });
  const log = JSON.parse(readFileSync(path, "utf8"));
  for (const record of log) record.acknowledged = true;
  writeFileSync(path, JSON.stringify(log, null, 2));

  assert.equal(main(root), 0);
  rmSync(root, { recursive: true, force: true });
});

test("renderOpen names each file and how it was waived", () => {
  const out = renderOpen([
    { file: "src/a.ts", rebaseline: true, at: "2026-07-30T09:00:00.000Z" },
    { file: "src/b.ts", rebaseline: false, at: "2026-07-30T10:00:00.000Z" },
  ]);
  assert.match(out, /2 unacknowledged waiver\(s\)/);
  assert.match(out, /src\/a\.ts {2}\[rebaseline\]/);
  assert.match(out, /src\/b\.ts {2}\[new-file ceiling\]/);
  assert.match(out, /skip-log\.json/);
});
