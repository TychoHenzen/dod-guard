// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { livePid, printJson } from "./detached-process.mjs";
import { reportState } from "./detached-report.mjs";

const DEFAULT_WAIT_SECONDS = 240;
const MIN_WAIT_SECONDS = 1;
const MAX_WAIT_SECONDS = 540;
const POLL_MS = 1000;
const MS_PER_SECOND = 1000;
const EXIT_UNKNOWN = 2;

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

// A supervisor that was killed never writes exit-code, so a dead pid with no
// exit file is a terminal state. The exit file is re-read after the pid check
// because a supervisor can finish between the two reads.
function settledState(stateDir) {
  const exitPath = path.join(stateDir, "exit-code");
  if (fs.existsSync(exitPath)) {
    return "exited";
  }
  if (livePid(path.join(stateDir, "pid")) !== null) {
    return null;
  }
  if (fs.existsSync(exitPath)) {
    return "exited";
  }
  return "died";
}

async function pollSettledState(stateDir, deadline) {
  let state = settledState(stateDir);
  while (!state && deadline - Date.now() > 0) {
    // biome-ignore lint/performance/noAwaitInLoops: Each poll waits out the previous sleep first.
    await sleep(Math.min(POLL_MS, deadline - Date.now()));
    state = settledState(stateDir);
  }
  return state ?? "running";
}

async function waitForCommand(stateDir, seconds) {
  const hasRun = fs.existsSync(path.join(stateDir, "pid")) || fs.existsSync(path.join(stateDir, "exit-code"));
  if (!hasRun) {
    printJson({ status: "unknown" });
    process.exitCode = EXIT_UNKNOWN;
    return;
  }
  const deadline = Date.now() + seconds * MS_PER_SECOND;
  reportState(stateDir, await pollSettledState(stateDir, deadline));
}

export { parseWaitSeconds, waitForCommand };
