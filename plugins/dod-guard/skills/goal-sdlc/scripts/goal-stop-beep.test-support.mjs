import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A pid file in a directory that the test context removes when the test ends.
export function pidFileFor(context) {
  const dir = mkdtempSync(join(tmpdir(), "goal-stop-"));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "pid.json");
}

export function recordFile(pidFile, record) {
  writeFileSync(pidFile, JSON.stringify(record));
}

export function fakeKill(calls, error) {
  return (pid) => {
    calls.push(pid);
    if (error) throw error;
  };
}

export const BEEP_COMMAND_LINE = "node C:/plugin/skills/goal-sdlc/scripts/goal-stop-beep.mjs start";

export function asBeepProcess() {
  return BEEP_COMMAND_LINE;
}
