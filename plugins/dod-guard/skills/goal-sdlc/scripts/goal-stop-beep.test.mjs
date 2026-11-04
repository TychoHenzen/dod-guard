import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main, STALE_MS, soundCommand, startBeeping, stopRecorded } from "./goal-stop-beep.mjs";

async function withPidFile(run) {
  const dir = mkdtempSync(join(tmpdir(), "goal-stop-"));
  try {
    return await run(join(dir, "pid.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function recordFile(pidFile, record) {
  writeFileSync(pidFile, JSON.stringify(record));
}

function fakeKill(calls, error) {
  return (pid) => {
    calls.push(pid);
    if (error) throw error;
  };
}

test("stopRecorded returns none when there is no record", async () => {
  await withPidFile((pidFile) => {
    const calls = [];
    assert.equal(stopRecorded({ pidFile, now: 1000, kill: fakeKill(calls) }), "none");
    assert.deepEqual(calls, []);
    assert.equal(existsSync(pidFile), false);
  });
});

test("stopRecorded kills the recorded pid of a fresh record, deletes the file, and returns stopped", async () => {
  await withPidFile((pidFile) => {
    const calls = [];
    recordFile(pidFile, { pid: 4242, startedAt: 1000 });
    assert.equal(stopRecorded({ pidFile, now: 2000, kill: fakeKill(calls) }), "stopped");
    assert.deepEqual(calls, [4242]);
    assert.equal(existsSync(pidFile), false);
  });
});

test("stopRecorded returns gone when kill throws ESRCH, and still deletes the file", async () => {
  await withPidFile((pidFile) => {
    const calls = [];
    recordFile(pidFile, { pid: 4242, startedAt: 1000 });
    const error = Object.assign(new Error("no such process"), { code: "ESRCH" });
    assert.equal(stopRecorded({ pidFile, now: 2000, kill: fakeKill(calls, error) }), "gone");
    assert.deepEqual(calls, [4242]);
    assert.equal(existsSync(pidFile), false);
  });
});

test("stopRecorded deletes a stale record (startedAt older than STALE_MS) without calling kill and returns stale", async () => {
  await withPidFile((pidFile) => {
    const calls = [];
    recordFile(pidFile, { pid: 4242, startedAt: 1000 });
    assert.equal(stopRecorded({ pidFile, now: 1000 + STALE_MS + 1, kill: fakeKill(calls) }), "stale");
    assert.deepEqual(calls, []);
    assert.equal(existsSync(pidFile), false);
  });
});

test("stopRecorded deletes an unreadable record (not JSON, or missing pid) without calling kill and returns unreadable", async () => {
  await withPidFile((pidFile) => {
    const calls = [];
    writeFileSync(pidFile, "not json {");
    assert.equal(stopRecorded({ pidFile, now: 2000, kill: fakeKill(calls) }), "unreadable");
    assert.equal(existsSync(pidFile), false);

    recordFile(pidFile, { startedAt: 1000 });
    assert.equal(stopRecorded({ pidFile, now: 2000, kill: fakeKill(calls) }), "unreadable");
    assert.equal(existsSync(pidFile), false);
    assert.deepEqual(calls, []);
  });
});

test("stopRecorded rethrows a kill error that is not ESRCH", async () => {
  await withPidFile((pidFile) => {
    recordFile(pidFile, { pid: 4242, startedAt: 1000 });
    const error = Object.assign(new Error("denied"), { code: "EPERM" });
    assert.throws(() => stopRecorded({ pidFile, now: 2000, kill: fakeKill([], error) }), error);
  });
});

test("startBeeping writes {pid, startedAt} before the first beep, beeps exactly `beeps` times, sleeps beeps-1 times with intervalSeconds*1000, and removes the file at the end", async () => {
  await withPidFile(async (pidFile) => {
    const beepSnapshots = [];
    const sleeps = [];
    let beeps = 0;
    await startBeeping({
      pidFile,
      pid: 77,
      now: () => 5000,
      kill: fakeKill([]),
      beeps: 3,
      intervalSeconds: 10,
      beep: () => {
        beepSnapshots.push(JSON.parse(readFileSync(pidFile, "utf8")));
        beeps += 1;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(beeps, 3);
    assert.deepEqual(sleeps, [10000, 10000]);
    assert.deepEqual(beepSnapshots[0], { pid: 77, startedAt: 5000 });
    assert.equal(existsSync(pidFile), false);
  });
});

test("startBeeping stops an earlier recorded reminder first (the fake kill receives the old pid)", async () => {
  await withPidFile(async (pidFile) => {
    const calls = [];
    recordFile(pidFile, { pid: 4242, startedAt: 1000 });
    await startBeeping({
      pidFile,
      pid: 77,
      now: () => 2000,
      kill: fakeKill(calls),
      beeps: 1,
      beep: () => {},
      sleep: async () => {},
    });
    assert.deepEqual(calls, [4242]);
    assert.equal(existsSync(pidFile), false);
  });
});

test("startBeeping leaves the file alone when another pid has since overwritten it", async () => {
  await withPidFile(async (pidFile) => {
    await startBeeping({
      pidFile,
      pid: 77,
      now: () => 5000,
      kill: fakeKill([]),
      beeps: 1,
      beep: () => {
        recordFile(pidFile, { pid: 555, startedAt: 5000 });
      },
      sleep: async () => {},
    });
    assert.deepEqual(JSON.parse(readFileSync(pidFile, "utf8")), { pid: 555, startedAt: 5000 });
  });
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
