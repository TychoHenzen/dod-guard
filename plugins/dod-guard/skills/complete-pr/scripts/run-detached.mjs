#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { spawn } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { fileURLToPath } from "node:url";

// ASSUMPTION: Medium risk. The launcher re-runs this same file as the detached
// supervisor (`__run`), which is the only way to keep one process that owns the
// command's exit code without a long-lived parent.
const SELF = fileURLToPath(import.meta.url);
const DEFAULT_WAIT_SECONDS = 240;
const MIN_WAIT_SECONDS = 1;
const MAX_WAIT_SECONDS = 540;
const POLL_MS = 1000;
const MS_PER_SECOND = 1000;
const EXIT_ALREADY_RUNNING = 3;
const EXIT_STILL_RUNNING = 4;

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function livePid(pidFile) {
  const pid = Number.parseInt(readText(pidFile), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    // EPERM means the process exists but belongs to another user, so it is still alive.
    if (error.code === "EPERM") {
      return pid;
    }
    return null;
  }
}

function usage() {
  process.stderr.write(
    [
      "Usage: node run-detached.mjs start <state-dir> -- <command> [args...]",
      "       node run-detached.mjs wait <state-dir> [--seconds N]\n",
    ].join("\n"),
  );
  process.exitCode = 2;
}

function startCommand(stateDir, command) {
  fs.mkdirSync(stateDir, { recursive: true });
  const pidFile = path.join(stateDir, "pid");
  const runningPid = livePid(pidFile);
  if (runningPid !== null) {
    printJson({ status: "running", pid: runningPid });
    process.exitCode = EXIT_ALREADY_RUNNING;
    return;
  }
  for (const name of ["exit-code", "stdout.log", "stderr.log"]) {
    fs.rmSync(path.join(stateDir, name), { force: true });
  }

  const child = spawn(process.execPath, [SELF, "__run", stateDir, "--", ...command], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  // The parent records the supervisor pid at once, so a second start that follows
  // immediately sees this run as live instead of starting a copy.
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  printJson({ status: "started", stateDir });
  process.exitCode = 0;
}

function writeExitCode(stateDir, exitCode) {
  const finalPath = path.join(stateDir, "exit-code");
  const tempPath = path.join(stateDir, "exit-code.tmp");
  fs.writeFileSync(tempPath, String(exitCode));
  fs.renameSync(tempPath, finalPath);
}

function runSupervised(stateDir, command) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "pid"), String(process.pid));
  const stdoutFd = fs.openSync(path.join(stateDir, "stdout.log"), "a");
  const stderrFd = fs.openSync(path.join(stateDir, "stderr.log"), "a");
  const child = spawn(command[0], command.slice(1), {
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
  });

  let finished = false;
  const finish = (exitCode) => {
    if (finished) {
      return;
    }
    finished = true;
    writeExitCode(stateDir, exitCode);
  };
  child.on("error", (error) => {
    fs.appendFileSync(path.join(stateDir, "stderr.log"), `${error.message}\n`);
    finish(1);
  });
  child.on("close", (code) => {
    let exitCode = 1;
    if (typeof code === "number") {
      exitCode = code;
    }
    finish(exitCode);
  });
}

function parseWaitSeconds(args) {
  const index = args.indexOf("--seconds");
  if (index === -1) {
    return DEFAULT_WAIT_SECONDS;
  }
  const seconds = Number.parseInt(args[index + 1], 10);
  if (!Number.isInteger(seconds)) {
    return DEFAULT_WAIT_SECONDS;
  }
  return Math.min(MAX_WAIT_SECONDS, Math.max(MIN_WAIT_SECONDS, seconds));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCommand(stateDir, seconds) {
  if (!fs.existsSync(stateDir)) {
    printJson({ status: "unknown" });
    process.exitCode = 2;
    return;
  }
  const exitPath = path.join(stateDir, "exit-code");
  const deadline = Date.now() + seconds * MS_PER_SECOND;
  while (!fs.existsSync(exitPath)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      printJson({ status: "running" });
      process.exitCode = EXIT_STILL_RUNNING;
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: Each poll must wait out the previous sleep before checking the exit file.
    await sleep(Math.min(POLL_MS, remaining));
  }
  const parsedCode = Number.parseInt(readText(exitPath), 10);
  let exitCode = 1;
  if (Number.isInteger(parsedCode)) {
    exitCode = parsedCode;
  }
  printJson({
    status: "exited",
    exitCode,
    stdout: readText(path.join(stateDir, "stdout.log")),
    stderr: readText(path.join(stateDir, "stderr.log")),
  });
  process.exitCode = 0;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);

  if (mode === "start") {
    const separator = args.indexOf("--");
    if (separator !== 1 || args.length <= 2) {
      usage();
      return;
    }
    startCommand(args[0], args.slice(separator + 1));
    return;
  }

  if (mode === "wait" && args.length > 0) {
    await waitForCommand(args[0], parseWaitSeconds(args));
    return;
  }

  if (mode === "__run") {
    const separator = args.indexOf("--");
    if (separator !== 1 || args.length <= 2) {
      usage();
      return;
    }
    runSupervised(args[0], args.slice(separator + 1));
    return;
  }

  usage();
}

await main();
