import { execSync } from "node:child_process";

/**
 * Runs git add -A + git commit, catching "nothing to commit" gracefully.
 * Re-throws real errors (not-a-repository, etc.).
 */
export function commitOrNoop(cwd: string, message: string): { committed: boolean } {
  try {
    execSync("git add -A", { cwd, timeout: 30_000 });
    execSync(`git commit -m "${message}"`, { cwd, timeout: 30_000 });
    return { committed: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("nothing to commit") || msg.includes("nothing added")) {
      return { committed: false };
    }
    throw err;
  }
}

/**
 * Detect the root branch name by checking common conventions.
 * Tries master, main, trunk, develop — returns the first match,
 * or "master" as default if none found or git fails.
 */
export function getRootBranch(cwd: string): string {
  try {
    const output = execSync("git branch --format '%(refname:short)'", {
      cwd,
      timeout: 10_000,
      encoding: "utf-8",
    });
    const branches = output
      .trim()
      .split("\n")
      .map((b) => b.trim());

    const candidates = ["master", "main", "trunk", "develop"];
    for (const candidate of candidates) {
      if (branches.includes(candidate)) return candidate;
    }
  } catch {
    // git command failed — fall through to default
  }
  return "master";
}
