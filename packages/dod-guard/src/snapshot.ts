// snapshot.ts — ephemeral git worktree for isolated proof execution

import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface Snapshot {
  cwd: string; // path to snapshot root (worktree or temp dir)
  commit: string; // the commit checked out
  cleanup: () => Promise<void>; // guaranteed cleanup
}

/**
 * Create an ephemeral checkout of `commit` in a temp worktree.
 * Returns the snapshot with the path to use as proof cwd.
 * Falls back to git archive + tar extract if worktree fails.
 */
export async function createSnapshot(repoCwd: string, commit: string): Promise<Snapshot> {
  const tmpPath = join(tmpdir(), `dod-snapshot-${randomUUID()}`);

  // Primary: git worktree add
  let createdViaWorktree = false;
  try {
    await execAsync(`git worktree add --detach "${tmpPath}" "${commit}"`, {
      cwd: repoCwd,
      timeout: 30000,
    });
    createdViaWorktree = true;
  } catch {
    // Fallback: git archive → tar extract into temp dir
    try {
      const archivePath = join(tmpdir(), `dod-archive-${randomUUID()}.tar`);
      await mkdir(tmpPath, { recursive: true });
      try {
        await execAsync(`git archive --output="${archivePath}" "${commit}"`, {
          cwd: repoCwd,
          timeout: 30000,
        });
        await execAsync(`tar -xf "${archivePath}" -C "${tmpPath}"`, { timeout: 30000 });
      } finally {
        await rm(archivePath, { recursive: true, force: true }).catch(() => {});
      }
    } catch {
      await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
      throw new Error(`could not create snapshot for commit ${commit}: git worktree add and git archive both failed`);
    }
  }

  return {
    cwd: tmpPath,
    commit,
    cleanup: async () => {
      if (createdViaWorktree) {
        // Try git worktree remove first (leaves .git worktree metadata clean)
        try {
          await execAsync(`git worktree remove --force "${tmpPath}"`, {
            cwd: repoCwd,
            timeout: 15000,
          });
        } catch {
          // Fall through to rm -rf
        }
      }
      // Always try rm -rf as final cleanup (handles Windows locked files)
      try {
        await rm(tmpPath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

/**
 * Convenience wrapper — tear down a snapshot by calling its cleanup method.
 * Allows callers to pass the snapshot object without destructuring.
 */
export async function destroySnapshot(snapshot: Snapshot): Promise<void> {
  await snapshot.cleanup();
}
