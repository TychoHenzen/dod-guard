import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { buildShellInvocation } from "./shell.js";

const execFileP = promisify(execFile);

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
  async function run(command: string): Promise<{ stdout: string; code: number }> {
    const { shell, args, verbatim } = buildShellInvocation(command);
    try {
      const { stdout } = await execFileP(shell, args, {
        cwd: process.cwd(),
        windowsHide: true,
        windowsVerbatimArguments: verbatim,
      });
      return { stdout, code: 0 };
    } catch (err: any) {
      return { stdout: err.stdout ?? "", code: err.code ?? 1 };
    }
  }

  it("runs a simple command and captures stdout", async () => {
    const { stdout, code } = await run("echo ok");
    assert.equal(code, 0);
    assert.match(stdout, /ok/);
  });

  it("preserves embedded double quotes", async () => {
    // The old escaping turned this into a no-op that exited 0 with no output.
    const { stdout, code } = await run(isWindows ? 'node -e "console.log(42)"' : "node -e 'console.log(42)'");
    assert.equal(code, 0);
    assert.match(stdout, /42/);
  });

  it("supports command chaining", async () => {
    const { stdout } = await run("echo alpha && echo beta");
    assert.match(stdout, /alpha/);
    assert.match(stdout, /beta/);
  });

  it("supports pipes", async () => {
    const { stdout } = await run(isWindows ? "echo needle | findstr needle" : "echo needle | grep needle");
    assert.match(stdout, /needle/);
  });

  it("propagates a non-zero exit code", async () => {
    const { code } = await run(isWindows ? "exit /b 3" : "exit 3");
    assert.equal(code, 3);
  });
});
