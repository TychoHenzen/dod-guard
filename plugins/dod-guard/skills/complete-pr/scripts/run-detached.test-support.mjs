// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawn, spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import os from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";

const LAUNCHER = path.join(import.meta.dirname, "run-detached.mjs");
const EXIT_ALREADY_RUNNING = 3;
const EXIT_STILL_RUNNING = 4;
const EXIT_SUPERVISOR_DIED = 5;
// biome-ignore lint/security/noSecrets: Inline Node script text for a test child, not a credential.
const SLEEP_SCRIPT = "setTimeout(()=>{},4000)";

function launch(args) {
  return spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8" });
}

function launchAsync(args) {
  return new Promise((resolve) => {
    spawn(process.execPath, [LAUNCHER, ...args], { stdio: "ignore" }).on("close", resolve);
  });
}

function tempStateDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-detached-"));
  return path.join(root, "state");
}

export {
  EXIT_ALREADY_RUNNING,
  EXIT_STILL_RUNNING,
  EXIT_SUPERVISOR_DIED,
  launch,
  launchAsync,
  SLEEP_SCRIPT,
  tempStateDir,
};
