import assert from "node:assert/strict";
import { test } from "node:test";
import { BEEP_COMMAND_LINE } from "./goal-stop-beep.test-support.mjs";
import { commandLineQuery, isBeepProcess, readCommandLine } from "./goal-stop-beep-identity.mjs";

test("commandLineQuery asks Win32_Process on win32 and ps elsewhere, for the given pid", () => {
  const [windows, windowsArgs] = commandLineQuery(4242, "win32");
  assert.equal(windows, "powershell");
  assert.match(windowsArgs.join(" "), /Win32_Process.*ProcessId=4242/);
  assert.deepEqual(commandLineQuery(4242, "linux"), ["ps", ["-p", "4242", "-o", "command="]]);
});

test("readCommandLine returns the trimmed output, and null when the query fails or prints nothing", () => {
  const answer = (status, stdout) => () => ({ status, stdout });
  assert.equal(readCommandLine(1, "linux", answer(0, "  node x.mjs \n")), "node x.mjs");
  assert.equal(readCommandLine(1, "linux", answer(1, "")), null);
  assert.equal(readCommandLine(1, "linux", answer(0, "\n")), null);
  assert.equal(
    readCommandLine(1, "linux", () => ({ status: null, error: new Error("missing") })),
    null,
  );
});

test("isBeepProcess accepts only a command line that runs the beep script", () => {
  assert.equal(isBeepProcess(BEEP_COMMAND_LINE), true);
  assert.equal(isBeepProcess("C:/Program Files/Editor/editor.exe"), false);
  assert.equal(isBeepProcess(null), false);
});
