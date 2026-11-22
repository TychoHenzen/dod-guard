// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { EXIT_SUPERVISOR_DIED, launch, tempStateDir } from "./run-detached.test-support.mjs";

const CHILD_EXIT_CODE = 3;
// A pid above the kernel limit on Linux and above any live Windows process, so no process ever owns it.
const NO_SUCH_PID = 2_147_483_646;

function stateDirWithPidFile(content) {
  const stateDir = tempStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "pid"), content);
  return stateDir;
}

test("a start replaces the pid file that a dead run left behind", () => {
  const stateDir = stateDirWithPidFile(String(NO_SUCH_PID));
  const started = launch(["start", stateDir, "--", "node", "-e", "process.exit(3)"]);
  assert.equal(started.status, 0, started.stdout);

  const waited = JSON.parse(launch(["wait", stateDir, "--seconds", "20"]).stdout);
  assert.equal(waited.status, "exited");
  assert.equal(waited.exitCode, CHILD_EXIT_CODE);
});

test("a pid file that holds no pid reads as a dead supervisor", () => {
  const stateDir = stateDirWithPidFile("not-a-pid");
  const waited = launch(["wait", stateDir, "--seconds", "2"]);
  assert.equal(waited.status, EXIT_SUPERVISOR_DIED, waited.stdout);
  assert.equal(JSON.parse(waited.stdout).status, "died");
});
