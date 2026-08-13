import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildShellInvocation, runShellCommand } from "./shell.js";

const isWindows = process.platform === "win32";

// ── Shell invocation shape ──────────────────────────────────────────────

describe("buildShellInvocation", () => {
  it("uses cmd.exe with /d /s /c on Windows", { skip: !isWindows }, () => {
    const { shell, args } = buildShellInvocation("echo ok");
    assert.equal(shell, "cmd.exe");
    assert.deepEqual(args.slice(0, 3), ["/d", "/s", "/c"]);
  });

  it("wraps the command in DOUBLE quotes on Windows, never single", { skip: !isWindows }, () => {
    const { args } = buildShellInvocation("echo ok");
    assert.equal(args[3], '"echo ok"');
    // Single-quote wrapping was the old bug: cmd.exe has no single-quote
    // grouping, so it looked for a program literally named `'echo`.
    assert.ok(!args[3].startsWith("'"), "command must not be wrapped in single quotes");
  });

  it("requests verbatim arguments on Windows so Node does not re-quote", { skip: !isWindows }, () => {
    assert.equal(buildShellInvocation("echo ok").verbatim, true);
  });

  it("uses /bin/sh -c without verbatim args on POSIX", { skip: isWindows }, () => {
    const { shell, args, verbatim } = buildShellInvocation("echo ok");
    assert.equal(shell, "/bin/sh");
    assert.deepEqual(args, ["-c", "echo ok"]);
    assert.equal(verbatim, false);
  });
});

// ── Real execution ──────────────────────────────────────────────────────
//
// These run actual commands. They are the regression guard for the Windows
// quoting bug, where every proof command silently failed with
// "'echo' is not recognized as an internal or external command".

describe("buildShellInvocation — real execution", () => {
  it("runs a simple command and captures stdout", async () => {
    const { stdout, code } = await runShellCommand("echo ok", process.cwd());
    assert.equal(code, 0);
    assert.match(stdout, /ok/);
  });

  it("preserves embedded double quotes", async () => {
    // The old escaping turned this into a no-op that exited 0 with no output.
    const command = isWindows ? 'node -e "console.log(42)"' : "node -e 'console.log(42)'";
    const { stdout, code } = await runShellCommand(command, process.cwd());
    assert.equal(code, 0);
    assert.match(stdout, /42/);
  });

  it("supports command chaining", async () => {
    const { stdout } = await runShellCommand("echo alpha && echo beta", process.cwd());
    assert.match(stdout, /alpha/);
    assert.match(stdout, /beta/);
  });

  it("supports pipes", async () => {
    const command = isWindows ? "echo needle | findstr needle" : "echo needle | grep needle";
    const { stdout } = await runShellCommand(command, process.cwd());
    assert.match(stdout, /needle/);
  });

  it("propagates a non-zero exit code", async () => {
    const { code } = await runShellCommand(isWindows ? "exit /b 3" : "exit 3", process.cwd());
    assert.equal(code, 3);
  });
});
