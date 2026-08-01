/**
 * The git calls the solve fanout needs, each one failure-tolerant.
 *
 * All attempts share one working directory, so every branch move goes
 * through here.
 */

import { execSync } from "node:child_process";
import { commitOrNoop } from "./git-helpers.js";

const GIT_TIMEOUT_MS = 10_000;

/** Check out a branch. Returns false when git refuses. */
export function checkoutBranch(cwd: string, branch: string): boolean {
  try {
    execSync(`git checkout ${branch}`, { cwd, timeout: GIT_TIMEOUT_MS, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Capture a diff for a git range. Returns an empty string when git fails. */
export function captureDiff(cwd: string, range: string): string {
  try {
    return String(execSync(`git diff ${range}`, { cwd, encoding: "utf-8", timeout: GIT_TIMEOUT_MS }) ?? "");
  } catch {
    return "";
  }
}

/** Commit whatever the worker changed. A commit failure is not fatal here. */
export function commitCandidate(cwd: string, message: string): void {
  try {
    commitOrNoop(cwd, message);
  } catch {
    // A dirty-tree or repository error leaves the diff empty, which the
    // caller already handles.
  }
}
