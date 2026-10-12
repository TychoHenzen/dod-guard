import { readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeServiceTree } from "./owned-resources.js";
import { OWNER_MARKER_FILE, SERVICE_ROOT_PREFIXES } from "./service-root.js";

export const UNMARKED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export type SweepVerdict = "keep" | "dead_owner" | "stale_unmarked";
export type SweepDeps = {
  directory: string;
  now: number;
  ownPid: number;
  isAlive: (pid: number) => boolean;
  remove: (path: string) => void;
  writeError: (line: string) => void;
};

/** Only ESRCH proves the owner is gone. EPERM means it exists under another user. */
export function isOwnerAlive(
  pid: number,
  kill: (pid: number, signal: 0) => unknown = process.kill,
): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export function readOwnerPid(root: string): number | undefined {
  try {
    const marker = JSON.parse(
      readFileSync(join(root, OWNER_MARKER_FILE), "utf8"),
    ) as { pid?: unknown } | null;
    const pid = marker?.pid;
    return typeof pid === "number" && Number.isInteger(pid) && pid > 0
      ? pid
      : undefined;
  } catch {
    return undefined;
  }
}

export function classifyServiceRoot(
  root: string,
  mtimeMs: number,
  deps: SweepDeps,
): SweepVerdict {
  const pid = readOwnerPid(root);
  if (pid !== undefined)
    return pid === deps.ownPid || deps.isAlive(pid) ? "keep" : "dead_owner";
  return deps.now - mtimeMs > UNMARKED_MAX_AGE_MS ? "stale_unmarked" : "keep";
}

export function sweepStaleServiceRoots(deps: SweepDeps): string[] {
  const removed: string[] = [];
  for (const name of serviceRootNames(deps.directory)) {
    const path = join(deps.directory, name);
    const verdict = verdictFor(path, deps);
    if (verdict === "keep") continue;
    try {
      deps.remove(path);
      deps.writeError(
        `code-explorer: removed stale temp root ${name} (${verdict})`,
      );
      removed.push(name);
    } catch {
      // Startup must not fail on one root; the next startup sweep retries it.
    }
  }
  return removed;
}

export function defaultSweepDeps(): SweepDeps {
  return {
    directory: tmpdir(),
    now: Date.now(),
    ownPid: process.pid,
    isAlive: (pid) => isOwnerAlive(pid),
    remove: removeServiceTree,
    writeError: (line) => process.stderr.write(`${line}\n`),
  };
}

function serviceRootNames(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          SERVICE_ROOT_PREFIXES.some((prefix) => entry.name.startsWith(prefix)),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function verdictFor(path: string, deps: SweepDeps): SweepVerdict {
  try {
    return classifyServiceRoot(path, statSync(path).mtimeMs, deps);
  } catch {
    // A root that vanished mid-sweep has nothing left to remove.
    return "keep";
  }
}
