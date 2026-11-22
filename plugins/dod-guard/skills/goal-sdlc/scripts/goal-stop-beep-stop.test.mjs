import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { STALE_MS, stopRecorded } from "./goal-stop-beep.mjs";
import { asBeepProcess, fakeKill, pidFileFor, recordFile } from "./goal-stop-beep.test-support.mjs";

function stopWith(pidFile, calls, overrides) {
  return stopRecorded({ pidFile, now: 2000, kill: fakeKill(calls), commandLineOf: asBeepProcess, ...overrides });
}

test("stopRecorded returns none when there is no record", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  assert.equal(stopWith(pidFile, calls, { now: 1000 }), "none");
  assert.deepEqual(calls, []);
  assert.equal(existsSync(pidFile), false);
});

test("stopRecorded kills the recorded pid of a fresh record, deletes the file, and returns stopped", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  assert.equal(stopWith(pidFile, calls), "stopped");
  assert.deepEqual(calls, [4242]);
  assert.equal(existsSync(pidFile), false);
});

test("stopRecorded returns gone when kill throws ESRCH, and still deletes the file", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  const error = Object.assign(new Error("no such process"), { code: "ESRCH" });
  assert.equal(stopWith(pidFile, calls, { kill: fakeKill(calls, error) }), "gone");
  assert.deepEqual(calls, [4242]);
  assert.equal(existsSync(pidFile), false);
});

test("stopRecorded deletes a record older than STALE_MS without calling kill and returns stale", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  assert.equal(stopWith(pidFile, calls, { now: 1000 + STALE_MS + 1 }), "stale");
  assert.deepEqual(calls, []);
  assert.equal(existsSync(pidFile), false);
});

test("stopRecorded deletes an unreadable record (not JSON, or missing pid) without calling kill", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  writeFileSync(pidFile, "not json {");
  assert.equal(stopWith(pidFile, calls), "unreadable");
  assert.equal(existsSync(pidFile), false);

  recordFile(pidFile, { startedAt: 1000 });
  assert.equal(stopWith(pidFile, calls), "unreadable");
  assert.equal(existsSync(pidFile), false);
  assert.deepEqual(calls, []);
});

test("stopRecorded rethrows a kill error that is not ESRCH", (t) => {
  const pidFile = pidFileFor(t);
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  const error = Object.assign(new Error("denied"), { code: "EPERM" });
  assert.throws(() => stopWith(pidFile, [], { kill: fakeKill([], error) }), error);
});

test("stopRecorded never kills a fresh record whose pid now runs another program, and deletes the file", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  const outcome = stopWith(pidFile, calls, { commandLineOf: () => "C:/Program Files/Editor/editor.exe notes.txt" });
  assert.equal(outcome, "foreign");
  assert.deepEqual(calls, []);
  assert.equal(existsSync(pidFile), false);
});

test("stopRecorded never kills a fresh record whose pid no longer exists", (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  assert.equal(stopWith(pidFile, calls, { commandLineOf: () => null }), "foreign");
  assert.deepEqual(calls, []);
});
