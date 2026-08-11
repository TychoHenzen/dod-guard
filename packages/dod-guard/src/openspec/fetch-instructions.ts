/**
 * Run `openspec instructions dod --change <id> --json` and parse its
 * stdout into `OpenSpecInstructions`. This is the one place `trace`
 * shells out to the openspec CLI, so it goes through the same
 * `buildShellInvocation` every proof command uses - see the "Shell"
 * section of evaluate-proof.ts for why that matters on Windows.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildShellInvocation } from "../evaluate-proof.js";
import type { OpenSpecInstructions } from "./types.js";

const execFileP = promisify(execFile);

export async function fetchInstructions(changeId: string, cwd: string): Promise<OpenSpecInstructions> {
  const command = `openspec instructions dod --change ${changeId} --json`;
  const { shell, args, verbatim } = buildShellInvocation(command);

  let stdout: string;
  try {
    const run = await execFileP(shell, args, {
      cwd,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = run.stdout;
  } catch (err) {
    throw new Error(`'${command}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return JSON.parse(stdout) as OpenSpecInstructions;
  } catch {
    throw new Error(`'${command}' did not print valid JSON.`);
  }
}
