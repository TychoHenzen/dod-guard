// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import os from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";

const LAUNCHER = path.join(import.meta.dirname, "run-detached.mjs");
const CHILD_EXIT_CODE = 3;
const EXIT_ALREADY_RUNNING = 3;
const EXIT_STILL_RUNNING = 4;
const STDOUT_MARKER = /hi/;
// biome-ignore lint/security/noSecrets: Inline Node script text for a test child, not a credential.
const SLEEP_SCRIPT = "setTimeout(()=>{},4000)";

function launch(args) {
  return spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8" });
}

function tempStateDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-detached-"));
  return path.join(root, "state");
}

test("reports the exit code of a finished command", () => {
  const stateDir = tempStateDir();
  const started = launch(["start", stateDir, "--", "node", "-e", "process.exit(3)"]);
  assert.equal(started.status, 0, started.stdout);

  const waited = launch(["wait", stateDir, "--seconds", "20"]);
  const report = JSON.parse(waited.stdout);
  assert.equal(report.status, "exited");
  assert.equal(report.exitCode, CHILD_EXIT_CODE);
});

test("reports running past a short wait", () => {
  const stateDir = tempStateDir();
  const started = launch(["start", stateDir, "--", "node", "-e", SLEEP_SCRIPT]);
  assert.equal(started.status, 0, started.stdout);

  const shortWait = launch(["wait", stateDir, "--seconds", "1"]);
  assert.equal(shortWait.status, EXIT_STILL_RUNNING);
  assert.equal(JSON.parse(shortWait.stdout).status, "running");

  const longWait = launch(["wait", stateDir, "--seconds", "20"]);
  assert.equal(longWait.status, 0);
  assert.equal(JSON.parse(longWait.stdout).status, "exited");
});

test("refuses a second start while running", () => {
  const stateDir = tempStateDir();
  const command = ["node", "-e", SLEEP_SCRIPT];
  const first = launch(["start", stateDir, "--", ...command]);
  assert.equal(first.status, 0, first.stdout);

  const second = launch(["start", stateDir, "--", ...command]);
  assert.equal(second.status, EXIT_ALREADY_RUNNING);
  assert.equal(JSON.parse(second.stdout).status, "running");

  const drained = launch(["wait", stateDir, "--seconds", "20"]);
  assert.equal(drained.status, 0);
});

test("captures stdout of the command", () => {
  const stateDir = tempStateDir();
  const started = launch(["start", stateDir, "--", "node", "-e", "console.log('hi')"]);
  assert.equal(started.status, 0, started.stdout);

  const waited = launch(["wait", stateDir, "--seconds", "20"]);
  assert.equal(waited.status, 0);
  assert.match(JSON.parse(waited.stdout).stdout, STDOUT_MARKER);
});
