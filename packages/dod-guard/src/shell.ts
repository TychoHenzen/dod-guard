import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileP = promisify(execFile);

export interface ShellRun {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Build the argv for running `command` through the host shell.
 *
 * On Windows this is `cmd.exe /d /s /c "command"`, passed with
 * windowsVerbatimArguments so Node does not re-quote the string. Node's default
 * Windows quoting escapes embedded double quotes in a way cmd.exe does not
 * understand. It silently mangles commands like `findstr /C:"x" file` and
 * `node -e "..."` - they run, exit 0, and produce nothing. `/s` tells cmd.exe to
 * strip exactly the outer quote pair we add here.
 *
 * Single quotes are NOT a grouping character in cmd.exe; wrapping in them makes
 * cmd look for a program literally named `'command`.
 */
export function buildShellInvocation(command: string): {
  shell: string;
  args: string[];
  verbatim: boolean;
} {
  if (process.platform === "win32") {
    return { shell: "cmd.exe", args: ["/d", "/s", "/c", `"${command}"`], verbatim: true };
  }
  return { shell: "/bin/sh", args: ["-c", command], verbatim: false };
}

/** Run `command` through the host shell and capture its output. */
export async function runShellCommand(command: string, cwd: string, timeoutMs = 120_000): Promise<ShellRun> {
  const { shell, args, verbatim } = buildShellInvocation(command);

  try {
    const { stdout, stderr } = await execFileP(shell, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? (err.signal !== undefined ? 128 : 1),
    };
  }
}
