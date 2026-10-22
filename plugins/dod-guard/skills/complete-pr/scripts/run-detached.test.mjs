// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  EXIT_ALREADY_RUNNING,
  EXIT_STILL_RUNNING,
  launch,
  SLEEP_SCRIPT,
  tempStateDir,
} from "./run-detached.test-support.mjs";

const CHILD_EXIT_CODE = 3;
const STDOUT_MARKER = /hi/;

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
