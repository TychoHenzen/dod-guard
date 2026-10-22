// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function recordedPid(pidFile) {
  const pid = Number.parseInt(readText(pidFile), 10);
  if (Number.isInteger(pid) && pid > 0) {
    return pid;
  }
  return null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user, so it is still alive.
    return error.code === "EPERM";
  }
}

function livePid(pidFile) {
  const pid = recordedPid(pidFile);
  if (pid !== null && isAlive(pid)) {
    return pid;
  }
  return null;
}

export { livePid, printJson, readText, recordedPid };
