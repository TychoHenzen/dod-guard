// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  EXIT_ALREADY_RUNNING,
  EXIT_SUPERVISOR_DIED,
  launch,
  launchAsync,
  SLEEP_SCRIPT,
  tempStateDir,
} from "./run-detached.test-support.mjs";

test("reports a supervisor that died without an exit code", () => {
  const stateDir = tempStateDir();
  const killSupervisor = ["process.kill(process.ppid)", "setTimeout(() => {}, 500)"].join(";");
  const started = launch(["start", stateDir, "--", "node", "-e", killSupervisor]);
  assert.equal(started.status, 0, started.stdout);

  const waited = launch(["wait", stateDir, "--seconds", "20"]);
  assert.equal(waited.status, EXIT_SUPERVISOR_DIED, waited.stdout);
  assert.equal(JSON.parse(waited.stdout).status, "died");
});

test("lets exactly one of two simultaneous starts claim the run", async () => {
  const stateDir = tempStateDir();
  const args = ["start", stateDir, "--", "node", "-e", SLEEP_SCRIPT];
  const codes = await Promise.all([launchAsync(args), launchAsync(args)]);
  assert.deepEqual(codes.sort(), [0, EXIT_ALREADY_RUNNING]);
  assert.equal(launch(["wait", stateDir, "--seconds", "20"]).status, 0);
});
