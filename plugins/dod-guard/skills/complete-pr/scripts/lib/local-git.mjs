// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local Git CLI from Node.
import { spawnSync } from "node:child_process";

const BACKSLASH = /\\/g;
const RECORD_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;

function runGit(args, acceptedExitCodes = [0]) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.error) {
    throw result.error;
  }
  if (!acceptedExitCodes.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `git exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

function normalizePath(value) {
  return value.replace(BACKSLASH, "/").toLowerCase();
}

export function parseWorktrees(output) {
  return output
    .trim()
    .split(RECORD_SEPARATOR)
    .filter(Boolean)
    .map((record) => {
      const values = Object.fromEntries(
        record.split(LINE_SEPARATOR).map((line) => {
          const separator = line.indexOf(" ");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
      );
      return {
        branch: values.branch?.replace("refs/heads/", "") ?? null,
        locked: Object.hasOwn(values, "locked"),
        path: values.worktree,
      };
    });
}

export class LocalGit {
  #commandRunner;

  constructor(commandRunner = runGit) {
    this.#commandRunner = commandRunner;
  }

  #run(args, acceptedExitCodes = [0]) {
    return this.#commandRunner(args, acceptedExitCodes);
  }

  #tryRun(args) {
    try {
      this.#run(args);
      return null;
    } catch (error) {
      return error.message;
    }
  }

  #cleanupCurrentWorktree(worktree, defaultBranch, dryRun) {
    if (dryRun) {
      return { path: worktree.path, result: "would_switch_to_default" };
    }
    const failure = this.#tryRun(["fetch", "--no-tags", "origin", defaultBranch])
      ?? this.#tryRun(["switch", defaultBranch])
      ?? this.#tryRun(["merge", "--ff-only", `origin/${defaultBranch}`]);
    if (failure) {
      return { path: worktree.path, result: "switch_refused" };
    }
    return { path: worktree.path, result: "switched_to_default" };
  }

  #cleanupOtherWorktree(worktree, dryRun) {
    if (dryRun) {
      return { path: worktree.path, result: "would_remove" };
    }
    if (this.#tryRun(["worktree", "remove", worktree.path])) {
      return { path: worktree.path, result: "remove_refused" };
    }
    return { path: worktree.path, result: "removed" };
  }

  #cleanupWorktree(worktree, currentPath, defaultBranch, dryRun) {
    if (worktree.locked) {
      return { path: worktree.path, result: "locked" };
    }
    if (this.worktreeIsDirty(worktree.path)) {
      return { path: worktree.path, result: "dirty" };
    }
    if (normalizePath(worktree.path) === normalizePath(currentPath)) {
      return this.#cleanupCurrentWorktree(worktree, defaultBranch, dryRun);
    }
    return this.#cleanupOtherWorktree(worktree, dryRun);
  }

  #branchResult(branchName, dryRun, worktrees, remainingWorktrees) {
    if (!this.hasLocalBranch(branchName)) {
      return "already_absent";
    }
    const preservesBranch = worktrees.some((worktree) => !worktree.result.startsWith("would_"));
    if (remainingWorktrees.length > 0 && (!dryRun || preservesBranch)) {
      return "retained_by_worktree";
    }
    if (dryRun) {
      return "would_delete";
    }
    const failed = this.#tryRun(["branch", "-d", branchName]) || this.hasLocalBranch(branchName);
    if (failed) {
      return "delete_refused";
    }
    return "deleted";
  }

  currentWorktree() {
    return this.#run(["rev-parse", "--show-toplevel"]).stdout.trim();
  }

  hasLocalBranch(branchName) {
    return this.#run(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], [0, 1]).status === 0;
  }

  listWorktrees() {
    return parseWorktrees(this.#run(["worktree", "list", "--porcelain"]).stdout);
  }

  worktreeIsDirty(path) {
    return this.#run(["-C", path, "status", "--porcelain"]).stdout.trim().length > 0;
  }

  cleanupBranch(branchName, defaultBranch, { dryRun = false } = {}) {
    const currentPath = this.currentWorktree();
    const targeted = this.listWorktrees().filter((worktree) => worktree.branch === branchName);
    const worktrees = targeted.map((worktree) => this.#cleanupWorktree(worktree, currentPath, defaultBranch, dryRun));
    const remainingWorktrees = this.listWorktrees().filter((worktree) => worktree.branch === branchName);
    const branch = this.#branchResult(branchName, dryRun, worktrees, remainingWorktrees);
    return { branch, remainingWorktrees, worktrees };
  }
}
