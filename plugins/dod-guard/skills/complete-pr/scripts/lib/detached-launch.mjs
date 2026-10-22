// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { spawn } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { livePid, printJson, readText, recordedPid } from "./detached-process.mjs";

const EXIT_ALREADY_RUNNING = 3;

function createPidFile(pidFile) {
  try {
    fs.writeFileSync(pidFile, String(process.pid), { flag: "wx" });
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    return false;
  }
}

// A stale file is removed only while it still holds what was read, so a claim
// made by a concurrent start in between survives.
function dropStalePidFile(pidFile, seen) {
  if (readText(pidFile) === seen) {
    fs.rmSync(pidFile, { force: true });
  }
}

// The pid file is created with the exclusive flag, holding the launcher's own pid
// until the supervisor pid is known. Two concurrent starts cannot both create it,
// and the loser sees a live pid instead of an empty file. Returns the live pid of
// another run, or null once this launcher owns the file.
function claimPidFile(pidFile) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (createPidFile(pidFile)) {
      return null;
    }
    const seen = readText(pidFile);
    const live = livePid(pidFile);
    if (live !== null) {
      return live;
    }
    dropStalePidFile(pidFile, seen);
  }
  return recordedPid(pidFile);
}

function startCommand(entryPath, stateDir, command) {
  fs.mkdirSync(stateDir, { recursive: true });
  const pidFile = path.join(stateDir, "pid");
  const runningPid = claimPidFile(pidFile);
  if (runningPid !== null) {
    printJson({ status: "running", pid: runningPid });
    process.exitCode = EXIT_ALREADY_RUNNING;
    return;
  }
  for (const name of ["exit-code", "stdout.log", "stderr.log"]) {
    fs.rmSync(path.join(stateDir, name), { force: true });
  }

  const child = spawn(process.execPath, [entryPath, "__run", stateDir, "--", ...command], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  printJson({ status: "started", stateDir });
  process.exitCode = 0;
}

export { startCommand };
