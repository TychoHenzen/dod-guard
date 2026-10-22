// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { spawn } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";

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

export { runSupervised };
