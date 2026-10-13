// The one place complete-pr's scripts start the GitHub CLI. Every caller passes the exit codes it
// can read; a caller that passes none treats any non-zero exit as a failure.
// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";

// One REST page of Project items reaches about 3.5 MB on the live Project, far past Node's 1 MiB default.
const GH_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;

export function runGh(args, acceptedExitCodes = [0], spawn = spawnSync) {
  const result = spawn("gh", args, { encoding: "utf8", windowsHide: true, maxBuffer: GH_OUTPUT_MAX_BUFFER });
  if (result.error) {
    throw result.error;
  }
  if (!acceptedExitCodes.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}
