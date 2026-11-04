import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultRecordFile, ensurePrivateDir, writeRecord } from "./goal-stop-beep-record.mjs";

function scratch(context) {
  const dir = mkdtempSync(join(tmpdir(), "goal-stop-rec-"));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const posix = process.platform === "win32" ? { skip: "POSIX permission bits" } : {};

test("defaultRecordFile sits under the home directory, not the temp directory", () => {
  assert.equal(defaultRecordFile("/home/user"), join("/home/user", ".dod-guard", "goal-stop.pid"));
  assert.ok(defaultRecordFile().startsWith(homedir()));
});

test("writeRecord creates the missing directory and writes the record", (t) => {
  const file = join(scratch(t), "state", "pid.json");
  writeRecord(file, { pid: 1, startedAt: 2 });
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { pid: 1, startedAt: 2 });
});

test("writeRecord refuses to overwrite a file that already exists", (t) => {
  const file = join(scratch(t), "pid.json");
  writeFileSync(file, "planted");
  assert.throws(() => writeRecord(file, { pid: 1, startedAt: 2 }), { code: "EEXIST" });
  assert.equal(readFileSync(file, "utf8"), "planted");
});

test("writeRecord does not follow a planted symlink", (t) => {
  const dir = scratch(t);
  const target = join(dir, "target.txt");
  writeFileSync(target, "victim");
  const file = join(dir, "pid.json");
  try {
    symlinkSync(target, file);
  } catch (error) {
    t.skip(`symlink unavailable: ${error.code}`);
    return;
  }
  assert.throws(() => writeRecord(file, { pid: 1, startedAt: 2 }), { code: "EEXIST" });
  assert.equal(readFileSync(target, "utf8"), "victim");
});

test("ensurePrivateDir creates an owner-only directory", posix, (t) => {
  const dir = join(scratch(t), "state");
  ensurePrivateDir(dir);
  assert.equal(statSync(dir).mode & 0o077, 0);
});

test("ensurePrivateDir rejects a directory owned by another user", (t) => {
  const dir = scratch(t);
  assert.throws(() => ensurePrivateDir(dir, 987654321), /owned by another user/);
});

test("ensurePrivateDir rejects a directory that others can write", posix, (t) => {
  const dir = scratch(t);
  chmodSync(dir, 0o777);
  assert.throws(() => ensurePrivateDir(dir), /writable by other users/);
});
