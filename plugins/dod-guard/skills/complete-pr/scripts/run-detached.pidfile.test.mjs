// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { launch, SLEEP_SCRIPT, tempStateDir } from "./run-detached.test-support.mjs";

const RUNS = 30;
const GUARD_MS = 10_000;
const WHOLE_NUMBER = /^\d+$/;

function readPid(pidFile) {
  try {
    return fs.readFileSync(pidFile, "utf8");
  } catch (error) {
    return `unreadable ${error.code}`;
  }
}

// Reads the pid file in a tight loop from the end of `start` until the supervisor writes exit-code, so the
// supervisor's own boot is covered. Returns every read that is not a whole pid number, and a marker when
// the supervisor never wrote exit-code, so a supervisor that crashed fails the test instead of passing it.
function badPidReads(stateDir) {
  const pidFile = path.join(stateDir, "pid");
  const exitFile = path.join(stateDir, "exit-code");
  const deadline = Date.now() + GUARD_MS;
  const bad = [];
  while (!fs.existsSync(exitFile) && Date.now() < deadline) {
    const text = readPid(pidFile);
    if (!WHOLE_NUMBER.test(text)) {
      bad.push(text);
    }
  }
  if (!fs.existsSync(exitFile)) {
    bad.push("no exit-code");
  }
  return bad;
}

test("never exposes an empty or partial pid file while the supervisor boots", () => {
  const bad = [];
  for (let run = 0; run < RUNS; run += 1) {
    const stateDir = tempStateDir();
    const started = launch(["start", stateDir, "--", "node", "-e", "0"]);
    assert.equal(started.status, 0, started.stdout);
    bad.push(...badPidReads(stateDir));
  }
  assert.equal(bad.length, 0, `${bad.length} bad pid reads, first: ${JSON.stringify(bad[0])}`);
});

test("records a live supervisor pid before start returns", () => {
  const stateDir = tempStateDir();
  const started = launch(["start", stateDir, "--", "node", "-e", SLEEP_SCRIPT]);
  assert.equal(started.status, 0, started.stdout);

  const pid = Number.parseInt(fs.readFileSync(path.join(stateDir, "pid"), "utf8"), 10);
  assert.doesNotThrow(() => process.kill(pid, 0));
  assert.equal(launch(["wait", stateDir, "--seconds", "20"]).status, 0);
});
