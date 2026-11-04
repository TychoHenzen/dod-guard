import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { main, startBeeping } from "./goal-stop-beep.mjs";
import { asBeepProcess, fakeKill, pidFileFor, recordFile } from "./goal-stop-beep.test-support.mjs";
import { soundCommand } from "./goal-stop-beep-sound.mjs";

function startWith(pidFile, overrides) {
  return startBeeping({
    pidFile,
    pid: 77,
    now: () => 5000,
    kill: fakeKill([]),
    commandLineOf: asBeepProcess,
    beeps: 1,
    beep: () => {},
    sleep: async () => {},
    ...overrides,
  });
}

test("startBeeping records its pid first, beeps `beeps` times, sleeps between, then removes the file", async (t) => {
  const pidFile = pidFileFor(t);
  const snapshots = [];
  const sleeps = [];
  const beep = () => snapshots.push(JSON.parse(readFileSync(pidFile, "utf8")));
  await startWith(pidFile, { beeps: 3, intervalSeconds: 10, beep, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(snapshots.length, 3);
  assert.deepEqual(sleeps, [10_000, 10_000]);
  assert.deepEqual(snapshots[0], { pid: 77, startedAt: 5000 });
  assert.equal(existsSync(pidFile), false);
});

test("startBeeping stops an earlier recorded reminder first (the fake kill receives the old pid)", async (t) => {
  const pidFile = pidFileFor(t);
  const calls = [];
  recordFile(pidFile, { pid: 4242, startedAt: 1000 });
  await startWith(pidFile, { now: () => 2000, kill: fakeKill(calls) });
  assert.deepEqual(calls, [4242]);
  assert.equal(existsSync(pidFile), false);
});

test("startBeeping leaves the file alone when another pid has since overwritten it", async (t) => {
  const pidFile = pidFileFor(t);
  const overwrite = () => recordFile(pidFile, { pid: 555, startedAt: 5000 });
  await startWith(pidFile, { beep: overwrite });
  assert.deepEqual(JSON.parse(readFileSync(pidFile, "utf8")), { pid: 555, startedAt: 5000 });
});

test("soundCommand returns powershell for win32, afplay for darwin, and paplay otherwise", () => {
  assert.equal(soundCommand("win32")[0], "powershell");
  assert.equal(soundCommand("darwin")[0], "afplay");
  assert.equal(soundCommand("linux")[0], "paplay");
  assert.equal(soundCommand("freebsd")[0], "paplay");
});

test("main returns 2 and prints the usage line for an unknown command", async () => {
  const lines = [];
  const code = await main(["bogus"], (line) => lines.push(line));
  assert.equal(code, 2);
  assert.deepEqual(lines, ["usage: node goal-stop-beep.mjs start | stop"]);
});
