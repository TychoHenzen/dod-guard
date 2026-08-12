/**
 * Read the openspec CLI's JSON surface: `instructions <artifact>` for one
 * artifact's resolved path and rules, `status` for the change's artifact
 * graph. These are the only places dod-guard shells out to openspec, so
 * they go through the same `buildShellInvocation` every proof command uses
 * - see the "Shell" section of evaluate-proof.ts for why that matters on
 * Windows.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildShellInvocation } from "../evaluate-proof.js";
import type { OpenSpecInstructions } from "./types.js";

const execFileP = promisify(execFile);

/** Run one openspec command in `cwd` and parse its stdout as JSON. */
async function runOpenSpecJson<T>(command: string, cwd: string): Promise<T> {
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
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`'${command}' did not print valid JSON.`);
  }
}

/** Resolve one artifact of `changeId` - its output path, template and rules.
 * `artifactId` is an id from the change's schema, e.g. "dod" or "steps". */
export async function fetchInstructions(
  changeId: string,
  cwd: string,
  artifactId: string,
): Promise<OpenSpecInstructions> {
  return runOpenSpecJson<OpenSpecInstructions>(`openspec instructions ${artifactId} --change ${changeId} --json`, cwd);
}

/** The change's artifact graph, which a generated plan carries verbatim so a
 * reader can tell which planning artifacts it was derived from. The rows stay
 * `unknown` on purpose: dod-guard copies them and never reads a field, so
 * openspec can add one without this needing to know. */
export async function fetchStatus(changeId: string, cwd: string): Promise<{ artifacts: unknown[] }> {
  return runOpenSpecJson<{ artifacts: unknown[] }>(`openspec status --json --change ${changeId}`, cwd);
}
