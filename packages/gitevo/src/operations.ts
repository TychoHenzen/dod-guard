/**
 * GitEvo operations — evolutionary git branching for LLM agents.
 *
 * Core workflow:
 *   init → checkpoint → spawn → (work) → learn → checkpoint → (loop)
 *   abandon (dead end) → revert to checkpoint
 *   adopt (winner) → merge to root
 *   finish → merge all, clean artifacts
 *
 * All git operations use execSync. All .evo/ state stored in .evo/ directory.
 * Lessons stored as JSONL in .evo/lessons.jsonl, exportable to obsidian-rag.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  closeMemoryDb,
  countMessages,
  getBranchSpawnPoint,
  getCheckpointTimestamps,
  migrateLessons,
  queryMessages,
  recordBranch,
  recordCheckpoint,
  writeMessage,
} from "./memory.js";

// ── Error types ───────────────────────────────────────────────────────

export class EvoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvoError";
  }
}

// ── Git helpers ───────────────────────────────────────────────────────

function git(args: string[], cwd?: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });

  if (result.error) {
    throw new EvoError(result.error.message);
  }

  if (result.status !== 0) {
    const errMsg = (result.stderr || "").trim() || (result.stdout || "").trim();
    throw new EvoError(errMsg);
  }

  return (result.stdout || "").trim();
}

function gitOrNull(args: string[], cwd?: string): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function getRepo(): { cwd: string; rootBranch: string } {
  let toplevel: string;
  try {
    toplevel = git(["rev-parse", "--show-toplevel"]);
  } catch {
    throw new EvoError("Not a git repository. Run 'git init' first.");
  }

  // Detect root branch
  let rootBranch = "main";
  const heads = git(["branch", "--format=%(refname:short)"], toplevel).split("\n");
  for (const name of ["main", "master", "trunk"]) {
    if (heads.includes(name)) {
      rootBranch = name;
      break;
    }
  }
  return { cwd: toplevel, rootBranch };
}

function currentBranch(cwd: string): string {
  return git(["branch", "--show-current"], cwd);
}

function isDirty(cwd: string): boolean {
  const status = git(["status", "--porcelain"], cwd);
  // Only count tracked file modifications, not untracked files
  const lines = status.split("\n").filter((l) => l.trim() && !l.startsWith("??"));
  return lines.length > 0;
}

/** Files that exist in HEAD but would be removed by switching to targetRef. */
function filesRemovedByCheckout(targetRef: string, cwd: string): string[] {
  // Validate ref exists first — don't silently return [] on git errors
  try {
    git(["rev-parse", "--verify", targetRef], cwd);
  } catch {
    throw new EvoError(`target ref '${targetRef}' does not exist`);
  }
  // --name-only --diff-filter=D: files deleted going from HEAD to targetRef
  // (i.e., files present in HEAD but not in targetRef)
  const diff = git(["diff", "--name-only", "--diff-filter=D", "HEAD", targetRef], cwd);
  return diff.split("\n").filter(Boolean);
}

/** Untracked source files at risk of being clobbered by checkout. */
function untrackedSourceFiles(cwd: string, config?: EvoConfig): string[] {
  const cfg = config ?? loadConfig(cwd);
  const escapedExts = cfg.sourceExtensions.map((e) => e.replace(/\./g, "\\."));
  const extPattern = new RegExp(`(${escapedExts.join("|")})$`);
  const status = git(["status", "--porcelain"], cwd);
  return status
    .split("\n")
    .filter((l) => l.startsWith("??"))
    .map((l) => l.slice(3).trim())
    .filter((f) => extPattern.test(f));
}

/** Stale dist/*.js files with no matching .ts source — compilation artifacts. */
function staleDistFiles(cwd: string, config?: EvoConfig): string[] {
  const cfg = config ?? loadConfig(cwd);
  if (cfg.skipStaleCheck) return [];

  const hasTs = cfg.sourceExtensions.includes(".ts");
  const stale: string[] = [];

  function scan(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        scan(full);
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".test.js")) {
        // Skip .test.js in JS-only repos — hand-written .test.js is normal there
        if (entry.name.endsWith(".test.js") && !hasTs) continue;

        // Check if matching .ts source exists
        const tsFile = full.replace(/\.js$/, ".ts");
        if (!fs.existsSync(tsFile)) {
          stale.push(path.relative(cwd, full));
        }
      }
    }
  }

  // Use config.buildLayouts for scanning
  for (const layout of cfg.buildLayouts) {
    const normalized = layout.replace(/\//g, path.sep).replace(/[/\\]$/, "");
    if (normalized.includes("*")) {
      const starIdx = normalized.indexOf("*");
      const beforeStar = normalized.slice(0, starIdx);
      const afterStar = normalized.slice(starIdx + 1);
      const parentDir = path.join(cwd, beforeStar);
      if (fs.existsSync(parentDir)) {
        for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            scan(path.join(parentDir, entry.name, afterStar));
          }
        }
      }
    } else {
      scan(path.join(cwd, normalized));
    }
  }

  return stale;
}

/**
 * Pre-flight safety check for operations that switch branches/tags.
 * Detects:
 *  (a) untracked source files that checkout might clobber
 *  (b) files committed in HEAD that would be removed by the target ref
 *  (c) stale dist/*.js without matching .ts source
 *
 * Returns null if safe, or a diagnostic message string if risks found.
 */
function preflightCheckoutSafety(targetRef: string, cwd: string, config?: EvoConfig): string | null {
  const cfg = config ?? loadConfig(cwd);
  const warnings: string[] = [];

  const untracked = untrackedSourceFiles(cwd, cfg);
  if (untracked.length > 0) {
    warnings.push(
      `Untracked source files (would persist but risk loss if directory removed):\n${untracked.map((f) => `  • ${f}`).join("\n")}`,
    );
  }

  const removed = filesRemovedByCheckout(targetRef, cwd);
  const sourceRemoved = removed.filter((f) => /\.ts$/.test(f) && !f.includes("dist/"));
  if (sourceRemoved.length > 0) {
    warnings.push(
      `Source files in HEAD NOT in '${targetRef}' — WILL BE DELETED by checkout:\n${sourceRemoved.map((f) => `  • ${f}`).join("\n")}\nCommit or stash these before spawning.`,
    );
  }

  const stale = staleDistFiles(cwd, cfg);
  if (stale.length > 0) {
    warnings.push(
      `Stale dist/*.js without matching .ts source:\n${stale.map((f) => `  • ${f}`).join("\n")}\nThese will survive checkout — clean with 'npm run clean && npm run build'.`,
    );
  }

  if (warnings.length === 0) return null;
  return warnings.join("\n\n");
}

function tagsWithPrefix(prefix: string, cwd: string): string[] {
  const output = gitOrNull(["tag", "-l", `${prefix}*`], cwd) || "";
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

function hasTag(tag: string, cwd: string): boolean {
  return tagsWithPrefix(tag, cwd).includes(tag);
}

function getTagMessage(tag: string, cwd: string): string {
  try {
    // git tag -l --format='%(contents)' <tag> returns annotation body
    const msg = git(["tag", "-l", `--format=%(contents)`, tag], cwd);
    return msg.trim() || "(no description)";
  } catch {
    return "(no description)";
  }
}

// ── .evo/ path helpers ────────────────────────────────────────────────

interface EvoPaths {
  evoDir: string;
  lessonsFile: string;
}

function evoPaths(cwd: string): EvoPaths {
  const evoDir = path.join(cwd, ".evo");
  return {
    evoDir,
    lessonsFile: path.join(evoDir, "lessons.jsonl"),
  };
}

function requireInit(cwd: string): EvoPaths {
  const paths = evoPaths(cwd);
  if (!fs.existsSync(paths.evoDir)) {
    throw new EvoError("GitEvo not initialized. Run evo_init first.");
  }
  return paths;
}

// ── EvoConfig ──────────────────────────────────────────────────────────

export interface EvoConfig {
  sourceExtensions: string[];
  buildLayouts: string[];
  skipStaleCheck: boolean;
}

export function loadConfig(cwd: string): EvoConfig {
  const configPath = path.join(cwd, ".evo", "config.json");
  const defaults: EvoConfig = {
    sourceExtensions: [".ts", ".js", ".mjs", ".json", ".md", ".yml", ".yaml"],
    buildLayouts: ["packages/*/dist/", "dist/"],
    skipStaleCheck: false,
  };
  if (!fs.existsSync(configPath)) return defaults;
  try {
    const user = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { ...defaults, ...user };
  } catch {
    return defaults;
  }
}

// ── Operations ────────────────────────────────────────────────────────

/**
 * Initialize GitEvo in the current repo.
 *
 * Creates .evo/ directory with lessons.jsonl. Tags HEAD as evo-root.
 * Re-running resets: clears lessons, re-tags root.
 */
export function evo_init(): string {
  const { cwd } = getRepo();
  const paths = evoPaths(cwd);

  // Create .evo/ directory
  fs.mkdirSync(paths.evoDir, { recursive: true });

  // Migrate existing lessons BEFORE clearing (prevents data loss on re-init)
  try {
    migrateLessons(cwd);
  } catch {}

  // Clear/create lessons.jsonl (AFTER migration)
  fs.writeFileSync(paths.lessonsFile, "", "utf-8");

  // Ensure .evo/ is gitignored
  const gitignore = path.join(cwd, ".gitignore");
  const evoEntry = ".evo/\n";
  if (fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, "utf-8");
    if (!content.includes(".evo/")) {
      fs.appendFileSync(gitignore, evoEntry);
    }
  } else {
    fs.writeFileSync(gitignore, evoEntry);
  }

  // Force re-tag evo-root
  try {
    git(["tag", "-d", "evo-root"], cwd);
  } catch {
    /* tag didn't exist */
  }
  git(["tag", "-a", "evo-root", "-m", "GitEvo root checkpoint"], cwd);

  return "GitEvo initialized. Root checkpoint tagged as evo-root.";
}

/**
 * Tag HEAD as evo-{name} with description. Refuses if working tree has
 * modified tracked files.
 */
export function evo_checkpoint(name: string, description: string): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  // Auto-stash if dirty — create a WIP commit so the checkpoint tag captures
  // uncommitted work, then soft-reset to restore the dirty working tree.
  let stashed = false;
  if (isDirty(cwd)) {
    git(["stash", "push", "-m", `gitevo: auto-stash before checkpoint '${name}'`], cwd);
    git(["stash", "apply"], cwd);
    git(["add", "-A"], cwd);
    git(["commit", "-m", `gitevo: WIP checkpoint '${name}'`], cwd);
    stashed = true;
  }

  const tagName = `evo-${name}`;
  try {
    git(["tag", "-d", tagName], cwd);
  } catch {
    /* doesn't exist */
  }
  git(["tag", "-a", tagName, "-m", description], cwd);

  // Undo the WIP commit and restore exact dirty working tree state
  if (stashed) {
    try {
      git(["reset", "--soft", "HEAD~1"], cwd);
      git(["reset", "HEAD", "."], cwd);
      git(["stash", "drop"], cwd);
    } catch {
      return `Checkpoint '${name}' created, but the WIP commit could not be cleanly undone — your changes are in the stash. Run 'git stash pop' to recover them.`;
    }
  }

  try {
    const branch = currentBranch(cwd);
    recordCheckpoint(tagName, branch, description, cwd);
  } catch {
    /* memory failure shouldn't break git tag */
  }

  return `Checkpoint '${name}' created.`;
}

/**
 * Append a lesson to the SQLite memory bus with timestamp and branch.
 */
export function evo_learn(content: string, repoOverride?: { cwd: string; rootBranch: string }): string {
  const repo = repoOverride ?? getRepo();
  const { cwd } = repo;
  requireInit(cwd);

  const branch = currentBranch(cwd);
  writeMessage("INSIGHT", content, { branch, metadata: { source: "evo_learn" } }, cwd);

  return `Lesson recorded on branch '${branch}'.`;
}

/**
 * Return all lessons from the SQLite memory bus, newest first.
 * Output format: numbered list with timestamp, branch, content.
 */
export function evo_lessons(): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  try {
    const results = queryMessages({ type: "INSIGHT", limit: 100 }, cwd);
    if (results.length > 0) {
      return results.map((m, i) => `[${i + 1}] ${m.timestamp} (${m.branch}): ${m.content}`).join("\n");
    }
  } catch {
    /* fall through */
  }

  return "No lessons recorded.";
}

/**
 * Return all lessons as raw JSON array, newest first.
 * Structured for obsidian-rag memory_save import.
 */
export function evo_export_lessons(): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  try {
    const results = queryMessages({ type: "INSIGHT", limit: 100 }, cwd);
    if (results.length === 0) {
      return JSON.stringify([]);
    }

    const lessons = results.map((m) => ({
      id: `gitevo-${lessonHash(m.content, m.branch, m.timestamp)}`,
      title: m.content.slice(0, 80),
      description: `GitEvo lesson from branch '${m.branch}'`,
      content: m.content,
      type: "feedback",
      metadata: {
        source: "gitevo",
        branch: m.branch,
        timestamp: m.timestamp,
      },
    }));

    return JSON.stringify(lessons, null, 2);
  } catch {
    return JSON.stringify([]);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function lessonHash(content: string, branch: string, timestamp: string): string {
  const input = `${content}|${branch}|${timestamp}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/**
 * Create a new branch from a checkpoint tag and check it out.
 * Auto-stashes dirty tracked changes before spawning, then pops them on the new branch.
 * If stash pop fails (merge conflict), the stash is left in place with a warning.
 */
export function evo_spawn(checkpoint_name: string, new_branch: string, force?: boolean): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const tagName = `evo-${checkpoint_name}`;
  if (!hasTag(tagName, cwd)) {
    const available = tagsWithPrefix("evo-", cwd).join(", ");
    throw new EvoError(
      `Checkpoint '${checkpoint_name}' not found. Available: ${available || "none"}. Run evo_checkpoints to list.`,
    );
  }

  // Verify branch doesn't exist
  const branches = git(["branch", "--format=%(refname:short)"], cwd).split("\n");
  if (branches.includes(new_branch)) {
    throw new EvoError(`Branch '${new_branch}' already exists.`);
  }

  // Auto-stash if dirty
  const wasDirty = isDirty(cwd);
  let stashed = false;
  if (wasDirty) {
    git(["stash", "push", "-m", "gitevo: auto-stash before spawn"], cwd);
    stashed = true;
  }

  // Pre-flight safety: detect files at risk before checkout
  const safetyWarnings = preflightCheckoutSafety(tagName, cwd);
  if (safetyWarnings && !force) {
    // Pop stash if we stashed
    if (stashed) {
      try {
        git(["stash", "pop"], cwd);
      } catch {
        /* leave in stash */
      }
    }
    throw new EvoError(
      `SAFETY CHECK FAILED — checkout to '${tagName}' would lose data:\n\n${safetyWarnings}\n\n` +
        `Pass force=true to proceed anyway (you accept the risk of data loss).`,
    );
  }

  // Create branch from tag and checkout
  git(["checkout", "-b", new_branch, tagName], cwd);

  // Pop stash on the new branch
  if (stashed) {
    try {
      git(["stash", "pop"], cwd);
    } catch {
      return `Spawned branch '${new_branch}' from checkpoint '${checkpoint_name}'. Auto-stash could not be reapplied — your changes are in the stash. Run git stash pop manually.`;
    }
  }

  try {
    recordBranch(new_branch, "active", `evo-${checkpoint_name}`, undefined, cwd);
  } catch {
    /* memory failure shouldn't break git ops */
  }

  const spawnMsg = `Spawned branch '${new_branch}' from checkpoint '${checkpoint_name}'.`;
  if (force && safetyWarnings) {
    return `${spawnMsg}\n\n⚠️ FORCED — safety checks bypassed:\n\n${safetyWarnings}`;
  }
  return spawnMsg;
}

/**
 * List all evo-* tags with descriptions, newest first.
 */
export function evo_checkpoints(): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const tags = tagsWithPrefix("evo-", cwd);
  if (tags.length === 0) return "No checkpoints found.";

  // Sort by checkpoint timestamp (newest first), falling back to tag name for tags not in SQLite
  const timestampMap = getCheckpointTimestamps(cwd);
  tags.sort((a, b) => {
    const ta = timestampMap.get(a) ?? "";
    const tb = timestampMap.get(b) ?? "";
    return tb.localeCompare(ta) || b.localeCompare(a);
  });

  const lines = tags.map((t) => {
    const desc = getTagMessage(t, cwd);
    return `  ${t}: ${desc}`;
  });

  return `Checkpoints:\n${lines.join("\n")}`;
}

/**
 * List all attempt branches (non-root, non-default).
 */
export function evo_branches(): string {
  const { cwd, rootBranch } = getRepo();
  requireInit(cwd);

  const defaultNames = new Set(["master", "main", "trunk"]);
  const branches = git(["branch", "--format=%(refname:short)"], cwd).split("\n");
  const attempts = branches.filter((b) => b && !defaultNames.has(b) && b !== rootBranch);

  if (attempts.length === 0) return "No attempt branches.";

  return `Branches:\n  ${attempts.sort().join("\n  ")}`;
}

/**
 * Abandon current branch: tag dead, revert to checkpoint or parent.
 *
 * Tags current branch as evo-dead-{branch}. If checkpoint given, reverts
 * to that checkpoint tag. Otherwise reverts to parent commit (git reset --hard HEAD~1).
 * Optionally records reason as a lesson. Refuses if dirty tree.
 */
export function evo_abandon(checkpoint?: string, reason?: string, force?: boolean): string {
  const { cwd, rootBranch } = getRepo();
  requireInit(cwd);

  // Auto-stash if dirty
  let stashed = false;
  let stashPopWarning = "";
  if (isDirty(cwd)) {
    git(["stash", "push", "-m", "gitevo: auto-stash before abandon"], cwd);
    stashed = true;
  }

  const branchName = currentBranch(cwd);

  // Determine revert target for safety check
  let targetRef: string;
  let targetDesc: string;
  if (checkpoint) {
    const tagName = `evo-${checkpoint}`;
    if (!hasTag(tagName, cwd)) {
      if (stashed) {
        try {
          git(["stash", "pop"], cwd);
        } catch {
          stashPopWarning = " Could not restore auto-stashed changes — they remain in the stash.";
        }
      }
      throw new EvoError(`Checkpoint '${checkpoint}' not found.${stashPopWarning}`);
    }
    targetRef = tagName;
    targetDesc = `checkpoint '${checkpoint}'`;
  } else {
    const spawnPoint = getBranchSpawnPoint(branchName, cwd);
    if (spawnPoint) {
      targetRef = spawnPoint;
      targetDesc = `spawn checkpoint '${spawnPoint}'`;
    } else {
      targetRef = "HEAD~1";
      targetDesc = "parent commit";
    }
  }

  // Pre-flight safety: detect files at risk before hard reset
  const safetyWarnings = preflightCheckoutSafety(targetRef, cwd);
  if (safetyWarnings && !force) {
    if (stashed) {
      try {
        git(["stash", "pop"], cwd);
      } catch {
        stashPopWarning = " Could not restore auto-stashed changes — they remain in the stash.";
      }
    }
    throw new EvoError(
      `SAFETY CHECK FAILED — reset to '${targetRef}' would lose data:\n\n${safetyWarnings}\n\n` +
        `Pass force=true to proceed anyway (you accept the risk of data loss).${stashPopWarning}`,
    );
  }

  // Record branch death in memory bus before revert
  try {
    recordBranch(branchName, "dead", undefined, undefined, cwd);
  } catch {
    /* silent */
  }

  // Hard reset to target FIRST — only tag dead after success
  git(["reset", "--hard", targetRef], cwd);

  // Tag as dead (only after reset succeeded)
  const deadTag = `evo-dead-${branchName}`;
  try {
    git(["tag", "-d", deadTag], cwd);
  } catch {}
  git(["tag", "-a", deadTag, "-m", `Abandoned branch '${branchName}'`], cwd);

  // Optionally record reason as lesson (pass repo info directly — avoid getRepo() post-reset)
  if (reason) {
    evo_learn(`[ABANDON] ${reason}`, { cwd, rootBranch });
  }

  const abandonMsg = `Branch '${branchName}' abandoned. Reverted to ${targetDesc}.${stashed ? " Auto-stashed dirty changes — run git stash pop to recover." : ""}`;
  if (force && safetyWarnings) {
    return `${abandonMsg}\n\n⚠️ FORCED — safety checks bypassed:\n\n${safetyWarnings}`;
  }
  return abandonMsg;
}

/**
 * Return git diff between two checkpoint tags.
 */
export function evo_diff(checkpoint_a: string, checkpoint_b: string): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const tagA = `evo-${checkpoint_a}`;
  const tagB = `evo-${checkpoint_b}`;

  for (const tag of [tagA, tagB]) {
    if (!hasTag(tag, cwd)) {
      throw new EvoError(`Checkpoint '${tag}' not found.`);
    }
  }

  const diff = git(["diff", tagA, tagB], cwd);
  return diff || "No differences between checkpoints.";
}

/**
 * Return overview: active branch, checkpoint count, lesson count,
 * dead branches, adopted state.
 */
export function evo_summary(): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const active = currentBranch(cwd);

  // Count checkpoints (evo-* tags, excluding evo-dead-* and evo-adopted)
  const allTags = tagsWithPrefix("evo-", cwd);
  const checkpoints = allTags.filter((t) => !t.startsWith("evo-dead-") && t !== "evo-adopted");

  // Count lessons from SQLite
  let lessonCount = 0;
  try {
    lessonCount = countMessages("INSIGHT", cwd);
  } catch {
    lessonCount = 0;
  }

  // Dead branches
  const deadBranches = allTags.filter((t) => t.startsWith("evo-dead-")).map((t) => t.slice("evo-dead-".length));

  // Adopted
  const adopted = hasTag("evo-adopted", cwd);

  return [
    `Active branch: ${active}`,
    `Checkpoints: ${checkpoints.length}`,
    `Lessons: ${lessonCount}`,
    `Dead branches: ${deadBranches.length}${deadBranches.length > 0 ? ` (${deadBranches.join(", ")})` : ""}`,
    `Adopted: ${adopted ? "yes" : "no"}`,
  ].join("\n");
}

/**
 * Merge winning branch into root branch, tag as evo-adopted.
 */
export function evo_adopt(branch: string): string {
  const { cwd, rootBranch } = getRepo();
  requireInit(cwd);

  if (isDirty(cwd)) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
  }

  const branches = git(["branch", "--format=%(refname:short)"], cwd).split("\n");
  if (!branches.includes(branch)) {
    throw new EvoError(`Branch '${branch}' not found.`);
  }

  const originalBranch = currentBranch(cwd);

  // Checkout root branch
  if (originalBranch !== rootBranch) {
    git(["checkout", rootBranch], cwd);
  }

  // Merge the feature branch — catch merge conflicts gracefully
  try {
    git(["merge", branch, "--no-edit"], cwd);
  } catch (err) {
    // Detect conflicted files before abort
    let conflictFiles: string[] = [];
    try {
      const output = gitOrNull(["diff", "--name-only", "--diff-filter=U"], cwd);
      if (output) conflictFiles = output.split("\n").filter(Boolean);
    } catch {
      /* best-effort */
    }

    // Abort merge to clean up MERGING state
    try {
      git(["merge", "--abort"], cwd);
    } catch {
      /* best-effort */
    }

    const fileList = conflictFiles.length > 0 ? `: ${conflictFiles.join(", ")}` : "";
    throw new EvoError(
      `adopt failed: merge conflicts${fileList}; resolve manually or abandon the branch`,
    );
  }

  // Tag as adopted
  try {
    git(["tag", "-d", "evo-adopted"], cwd);
  } catch {}
  git(["tag", "-a", "evo-adopted", "-m", `Adopted branch '${branch}' into ${rootBranch}`], cwd);

  try {
    recordBranch(branch, "adopted", undefined, undefined, cwd);
  } catch {
    /* silent */
  }

  return `Branch '${branch}' merged into '${rootBranch}' and tagged evo-adopted.`;
}

/**
 * Declare current state definitive: merge to root, clean ALL evo artifacts.
 *
 * Deletes all evo-* tags, removes all side branches, removes .evo/ directory.
 */
export function evo_finish(): string {
  const { cwd, rootBranch } = getRepo();
  requireInit(cwd);

  const branches = git(["branch", "--format=%(refname:short)"], cwd).split("\n");
  const current = currentBranch(cwd);

  // If not on root, merge current into root
  if (current !== rootBranch) {
    try {
      evo_adopt(current);
    } catch (err) {
      throw new EvoError(
        `Finish failed: internal adopt failed — ${(err as Error).message}`,
      );
    }
  }

  // Delete all evo-* tags
  const allEvoTags = tagsWithPrefix("evo-", cwd);
  for (const tag of allEvoTags) {
    try {
      git(["tag", "-d", tag], cwd);
    } catch {}
  }

  // Delete all side branches except root and defaults
  const defaultNames = new Set(["master", "main", "trunk"]);
  for (const branch of branches) {
    if (branch === rootBranch || defaultNames.has(branch)) continue;
    try {
      git(["branch", "-D", branch], cwd);
    } catch {}
  }

  // Close SQLite handle before removing .evo/ (Windows: open handle blocks unlink)
  closeMemoryDb(cwd);

  // Remove .evo/ directory
  const paths = evoPaths(cwd);
  if (fs.existsSync(paths.evoDir)) {
    fs.rmSync(paths.evoDir, { recursive: true, force: true });
  }

  return `Evolution complete. All artifacts cleaned. Root branch: ${rootBranch}.`;
}
