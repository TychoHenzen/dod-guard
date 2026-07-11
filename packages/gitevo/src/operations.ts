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
import * as fs from "node:fs";
import * as path from "node:path";

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
  const cwd = process.cwd();
  try {
    git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    throw new EvoError("Not a git repository. Run 'git init' first.");
  }

  // Detect root branch
  let rootBranch = "main";
  const heads = git(["branch", "--format=%(refname:short)"], cwd).split("\n");
  for (const name of ["main", "master", "trunk"]) {
    if (heads.includes(name)) {
      rootBranch = name;
      break;
    }
  }
  return { cwd, rootBranch };
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

  // Clear/create lessons.jsonl
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

  if (isDirty(cwd)) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
  }

  const tagName = `evo-${name}`;
  try {
    git(["tag", "-d", tagName], cwd);
  } catch {
    /* doesn't exist */
  }
  git(["tag", "-a", tagName, "-m", description], cwd);

  return `Checkpoint '${name}' created.`;
}

/**
 * Append a lesson to .evo/lessons.jsonl with timestamp and branch.
 */
export function evo_learn(content: string): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const branch = currentBranch(cwd);
  const lesson = {
    content,
    timestamp: new Date().toISOString(),
    branch,
  };

  const paths = evoPaths(cwd);
  fs.appendFileSync(paths.lessonsFile, `${JSON.stringify(lesson)}\n`, "utf-8");

  return `Lesson recorded on branch '${branch}'.`;
}

/**
 * Return all lessons from .evo/lessons.jsonl, newest first.
 * Output format: numbered list with timestamp, branch, content.
 */
export function evo_lessons(): string {
  const { cwd } = getRepo();
  const paths = requireInit(cwd);

  if (!fs.existsSync(paths.lessonsFile)) {
    return "No lessons recorded.";
  }

  const content = fs.readFileSync(paths.lessonsFile, "utf-8").trim();
  if (!content) return "No lessons recorded.";

  const lessons = content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .reverse(); // newest first

  return lessons.map((l, i) => `[${i + 1}] ${l.timestamp} (${l.branch}): ${l.content}`).join("\n");
}

/**
 * Return all lessons as raw JSON array, newest first.
 * Structured for obsidian-rag memory_save import.
 */
export function evo_export_lessons(): string {
  const { cwd } = getRepo();
  const paths = requireInit(cwd);

  if (!fs.existsSync(paths.lessonsFile)) {
    return JSON.stringify([]);
  }

  const content = fs.readFileSync(paths.lessonsFile, "utf-8").trim();
  if (!content) return JSON.stringify([]);

  const lessons = content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const parsed = JSON.parse(l);
      return {
        id: `gitevo-${slugify(parsed.content.slice(0, 40))}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: parsed.content.slice(0, 80),
        description: `GitEvo lesson from branch '${parsed.branch}'`,
        content: parsed.content,
        type: "feedback",
        metadata: {
          source: "gitevo",
          branch: parsed.branch,
          timestamp: parsed.timestamp,
        },
      };
    })
    .reverse();

  return JSON.stringify(lessons, null, 2);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

/**
 * Create a new branch from a checkpoint tag and check it out.
 * Refuses if tree is dirty, checkpoint not found, or branch exists.
 */
export function evo_spawn(checkpoint_name: string, new_branch: string): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  if (isDirty(cwd)) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
  }

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

  // Create branch from tag and checkout
  git(["checkout", "-b", new_branch, tagName], cwd);

  return `Spawned branch '${new_branch}' from checkpoint '${checkpoint_name}'.`;
}

/**
 * List all evo-* tags with descriptions, newest first.
 */
export function evo_checkpoints(): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  const tags = tagsWithPrefix("evo-", cwd);
  if (tags.length === 0) return "No checkpoints found.";

  // Sort by tag name descending (roughly newest first for sequential names)
  tags.sort().reverse();

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
export function evo_abandon(checkpoint?: string, reason?: string): string {
  const { cwd } = getRepo();
  requireInit(cwd);

  if (isDirty(cwd)) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
  }

  const branchName = currentBranch(cwd);

  // Tag as dead
  const deadTag = `evo-dead-${branchName}`;
  try {
    git(["tag", "-d", deadTag], cwd);
  } catch {}
  git(["tag", "-a", deadTag, "-m", `Abandoned branch '${branchName}'`], cwd);

  // Determine revert target
  let targetDesc: string;
  if (checkpoint) {
    const tagName = `evo-${checkpoint}`;
    if (!hasTag(tagName, cwd)) {
      throw new EvoError(`Checkpoint '${checkpoint}' not found.`);
    }
    // Hard reset to checkpoint tag
    git(["reset", "--hard", tagName], cwd);
    targetDesc = `checkpoint '${checkpoint}'`;
  } else {
    // Revert to parent commit
    git(["reset", "--hard", "HEAD~1"], cwd);
    targetDesc = "parent commit";
  }

  // Optionally record reason as lesson
  if (reason) {
    evo_learn(`[ABANDON] ${reason}`);
  }

  return `Branch '${branchName}' abandoned. Reverted to ${targetDesc}.`;
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

  // Count lessons
  const paths = evoPaths(cwd);
  let lessonCount = 0;
  if (fs.existsSync(paths.lessonsFile)) {
    const content = fs.readFileSync(paths.lessonsFile, "utf-8").trim();
    if (content) {
      lessonCount = content.split("\n").filter((l) => l.trim()).length;
    }
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

  // Merge the feature branch
  git(["merge", branch, "--no-edit"], cwd);

  // Tag as adopted
  try {
    git(["tag", "-d", "evo-adopted"], cwd);
  } catch {}
  git(["tag", "-a", "evo-adopted", "-m", `Adopted branch '${branch}' into ${rootBranch}`], cwd);

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
    evo_adopt(current);
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

  // Remove .evo/ directory
  const paths = evoPaths(cwd);
  if (fs.existsSync(paths.evoDir)) {
    fs.rmSync(paths.evoDir, { recursive: true, force: true });
  }

  return `Evolution complete. All artifacts cleaned. Root branch: ${rootBranch}.`;
}
