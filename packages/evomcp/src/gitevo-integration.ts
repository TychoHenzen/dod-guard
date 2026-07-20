/**
 * gitevo integration helpers for evomcp's evolutionary loop.
 *
 * Wraps gitevo's git operations (checkpoint, spawn, adopt, abandon, learn)
 * so evomcp can manage evolutionary branches without direct knowledge of
 * gitevo's internals or error types.
 *
 * All failures are logged via console.error and re-thrown as plain Error.
 */

import {
  EvoError,
  evo_abandon,
  evo_adopt,
  evo_checkpoint,
  evo_learn,
  evo_spawn,
} from "../../gitevo/dist/operations.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Safely wrap a gitevo call: catch EvoError, log, re-throw as plain Error.
 * Returns the result string on success.
 */
async function wrapGitevo<T extends (...args: any[]) => string>(
  fn: T,
  args: Parameters<T>,
  label: string,
): Promise<string> {
  try {
    const result = fn(...args);
    console.error(`evomcp[gitevo]: ${label} succeeded — ${result.slice(0, 80)}`);
    return result;
  } catch (err) {
    const message = err instanceof EvoError ? err.message : String(err);
    console.error(`evomcp[gitevo]: ${label} failed — ${message}`);
    throw new Error(`gitevo ${label}: ${message}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Tag HEAD as an evolution-generation checkpoint.
 *
 * Calls evo_checkpoint(\`evolve-gen${gen}\`, description, cwd). If the working
 * tree has dirty tracked files, gitevo auto-stashes before tagging and
 * pops after.
 */
export async function checkpointGeneration(gen: number, description: string, cwd: string): Promise<void> {
  await wrapGitevo(evo_checkpoint, [`evolve-gen${gen}`, description, cwd], `checkpoint gen ${gen}`);
}

/**
 * Create and checkout a new branch from an existing checkpoint.
 *
 * Calls evo_spawn(checkpointName, branchName, false, cwd) — force=false keeps
 * safety checks enabled (prevents data loss from untracked source files,
 * stale dist artifacts, or files that would be deleted by the checkout).
 */
export async function spawnCandidate(checkpointName: string, branchName: string, cwd: string): Promise<void> {
  await wrapGitevo(
    evo_spawn,
    [checkpointName, branchName, false, cwd],
    `spawn '${branchName}' from '${checkpointName}'`,
  );
}

/**
 * Merge a winning candidate branch into the root branch.
 *
 * Calls evo_adopt(branchName, cwd), which checks out root, merges the feature
 * branch, and tags the merge as evo-adopted. Throws if the tree is dirty.
 */
export async function adoptWinner(branchName: string, cwd: string): Promise<void> {
  await wrapGitevo(evo_adopt, [branchName, cwd], `adopt '${branchName}'`);
}

/**
 * Abandon the current branch as a dead end.
 *
 * Calls evo_abandon(undefined, reason, false, cwd):
 *  - No checkpoint target → reverts to parent commit (HEAD~1) or spawn checkpoint
 *  - Records the reason as a gitevo lesson for cross-lineage memory
 *  - Tags the branch as evo-dead-{branch} after reverting
 *  - force=false keeps safety checks enabled
 */
export async function abandonLoser(_branchName: string, reason: string, cwd: string): Promise<void> {
  await wrapGitevo(evo_abandon, [undefined, reason, false, cwd], `abandon (reason: ${reason.slice(0, 60)})`);
}

/**
 * Record a lesson for cross-lineage learning.
 *
 * Calls evo_learn(content, { cwd, rootBranch: 'main' }), which appends a
 * JSONL entry to .evo/lessons.jsonl with timestamp and current branch info.
 */
export async function learnFromFailure(content: string, cwd: string): Promise<void> {
  await wrapGitevo(evo_learn, [content, { cwd, rootBranch: "main" }], `learn: ${content.slice(0, 60)}`);
}

/**
 * Return the full git tag name gitevo uses for a given checkpoint.
 *
 * gitevo convention: evo-{name}
 */
export function getCheckpointTag(checkpointName: string): string {
  return `evo-${checkpointName}`;
}
