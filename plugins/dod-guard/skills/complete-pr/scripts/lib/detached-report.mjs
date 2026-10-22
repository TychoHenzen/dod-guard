// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import { printJson, readText } from "./detached-process.mjs";

const EXIT_STILL_RUNNING = 4;
const EXIT_SUPERVISOR_DIED = 5;

function logs(stateDir) {
  return {
    stdout: readText(path.join(stateDir, "stdout.log")),
    stderr: readText(path.join(stateDir, "stderr.log")),
  };
}

function exitedReport(stateDir) {
  const parsedCode = Number.parseInt(readText(path.join(stateDir, "exit-code")), 10);
  let exitCode = 1;
  if (Number.isInteger(parsedCode)) {
    exitCode = parsedCode;
  }
  return { status: "exited", exitCode, ...logs(stateDir) };
}

// Prints the report for a settled run, or "running" when the wait ran out.
function reportState(stateDir, state) {
  if (state === "exited") {
    printJson(exitedReport(stateDir));
    process.exitCode = 0;
    return;
  }
  if (state === "died") {
    printJson({ status: "died", note: "supervisor exited without writing an exit code", ...logs(stateDir) });
    process.exitCode = EXIT_SUPERVISOR_DIED;
    return;
  }
  printJson({ status: "running" });
  process.exitCode = EXIT_STILL_RUNNING;
}

export { reportState };
