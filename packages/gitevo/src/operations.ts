/**
 * gitevo operations: mark a point in a repository's history, branch from that
 * mark to try something, throw the attempt away or keep it, record what was
 * learned.
 *
 * Every operation resolves the git top level first, so state lands in
 * <top level>/.evo whatever directory the caller runs from. Every success is a
 * human readable string, every refusal an EvoError. Git effects happen before
 * the durable record is written, so a failed write never undoes them.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig } from "./evo-config.js";
import { EvoError } from "./evo-error.js";
import {
  activeBranch,
  branchExists,
  branchNames,
  evoTags,
  git,
  gitTry,
  initializedRoot,
  resolveRoot,
  restoreAside,
  rootBranchOf,
  setAside,
  statusLines,
  tagDescription,
} from "./evo-git.js";
import { recordLesson } from "./evo-lessons.js";
import { guardMove } from "./evo-safety.js";
import {
  closeMemoryDb,
  countMessages,
  getBranchSpawnPoint,
  getCheckpointTimestamps,
  migrateLessons,
  recordBranch,
  recordCheckpoint,
} from "./memory.js";

export { type EvoConfig, loadConfig } from "./evo-config.js";
export { EvoError } from "./evo-error.js";
export { evo_export_lessons, evo_learn, evo_lessons } from "./evo-lessons.js";

const DEAD = "evo-dead-";

// ── Initializing ──────────────────────────────────────────────────────

export function evo_init(): string {
  const root = resolveRoot();
  const evoDir = path.join(root, ".evo");
  fs.mkdirSync(evoDir, { recursive: true });
  excludeEvoDir(root);
  keepRecords(() => migrateLessons(root));
  fs.writeFileSync(path.join(evoDir, "lessons.jsonl"), "");
  git(["tag", "-f", "-a", "evo-root", "-m", "root checkpoint"], root);
  return "GitEvo initialized. Root checkpoint tagged as evo-root.";
}

/** Ignore .evo/ per repository, which leaves the working tree untouched. */
function excludeEvoDir(root: string): void {
  const gitDir = path.resolve(root, git(["rev-parse", "--git-common-dir"], root));
  const file = path.join(gitDir, "info", "exclude");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === ".evo/")) return;
  fs.appendFileSync(file, current === "" || current.endsWith("\n") ? ".evo/\n" : "\n.evo/\n");
}

// ── Marking a point ───────────────────────────────────────────────────

export function evo_checkpoint(name: string, description: string, cwdOverride?: string): string {
  const root = initializedRoot(cwdOverride);
  const head = git(["rev-parse", "HEAD"], root);
  const dirty = statusLines(root).length > 0;
  if (dirty) {
    git(["add", "-A"], root);
    git(["commit", "--no-verify", "-m", `WIP checkpoint: ${name}`], root);
  }
  git(["tag", "-f", "-a", `evo-${name}`, "-m", description], root);
  if (dirty) git(["reset", "--mixed", head], root);
  keepRecords(() => recordCheckpoint(`evo-${name}`, activeBranch(root), description, root));
  return `Checkpoint '${name}' created.`;
}

// ── Branching and rewinding ───────────────────────────────────────────

export function evo_spawn(checkpoint_name: string, new_branch: string, force?: boolean, cwdOverride?: string): string {
  const root = initializedRoot(cwdOverride);
  const tag = `evo-${checkpoint_name}`;
  if (!evoTags(root).includes(tag)) throw new EvoError(unknownCheckpoint(root, checkpoint_name));
  if (branchExists(root, new_branch)) throw new EvoError(`Branch '${new_branch}' already exists.`);
  const status = statusLines(root);
  const notes = guardMove({ root, target: tag, status, config: loadConfig(root) }, force);
  const held = setAside(root, status);
  git(["checkout", "-b", new_branch, tag], root);
  const trouble = restoreAside(root, held);
  keepRecords(() => recordBranch(new_branch, "active", tag, undefined, root));
  return joinReport(`Spawned branch '${new_branch}' from checkpoint '${checkpoint_name}'.`, [notes, trouble]);
}

function unknownCheckpoint(root: string, name: string): string {
  const available = markNames(root);
  const listed = available.length > 0 ? available.join(", ") : "none";
  return `Checkpoint '${name}' not found. Available: ${listed}. Run evo_checkpoints to list.`;
}

export function evo_abandon(checkpoint?: string, reason?: string, force?: boolean, cwdOverride?: string): string {
  const root = initializedRoot(cwdOverride);
  const branch = activeBranch(root);
  const target = abandonTarget(root, branch, checkpoint);
  const status = statusLines(root);
  const notes = guardMove({ root, target: target.ref, status, config: loadConfig(root) }, force);
  const held = setAside(root, status);
  const dead = git(["rev-parse", "HEAD"], root);
  git(["reset", "--hard", target.ref], root);
  git(["tag", "-f", "-a", `${DEAD}${branch}`, "-m", reason ?? "abandoned", dead], root);
  keepRecords(() => recordBranch(branch, "dead", undefined, undefined, root));
  if (reason) keepRecords(() => recordLesson(root, branch, `[ABANDON] ${reason}`));
  return joinReport(`Branch '${branch}' abandoned. Reverted to ${target.label}.`, [notes, heldNote(held)]);
}

/** Where the rewind lands: the named mark, the spawn point, or one commit back. */
function abandonTarget(root: string, branch: string, checkpoint?: string): { ref: string; label: string } {
  if (checkpoint) {
    if (!evoTags(root).includes(`evo-${checkpoint}`)) throw new EvoError(`Checkpoint '${checkpoint}' not found.`);
    return { ref: `evo-${checkpoint}`, label: `checkpoint '${checkpoint}'` };
  }
  const spawn = keepRecords(() => getBranchSpawnPoint(branch, root));
  if (spawn) return { ref: spawn, label: `spawn checkpoint '${spawn}'` };
  return { ref: "HEAD~1", label: "the previous commit" };
}

function heldNote(held: boolean): string {
  if (!held) return "";
  return "Uncommitted changes were set aside. They are recoverable: run 'git stash pop'.";
}

// ── Listing and reporting ─────────────────────────────────────────────

export function evo_checkpoints(): string {
  const root = initializedRoot();
  const tags = evoTags(root);
  if (tags.length === 0) return "No checkpoints found.";
  const times = keepRecords(() => getCheckpointTimestamps(root)) ?? new Map<string, string>();
  const newestFirst = [...tags].sort((a, b) => (times.get(b) ?? "").localeCompare(times.get(a) ?? ""));
  const shown = newestFirst.map((tag) => `  ${tag}: ${tagDescription(root, tag) || "(no description)"}`);
  return ["Checkpoints:", ...shown].join("\n");
}

export function evo_branches(): string {
  const root = initializedRoot();
  const skip = keepBranches(root);
  const attempts = branchNames(root).filter((name) => !skip.has(name));
  if (attempts.length === 0) return "No attempt branches.";
  return ["Branches:", ...attempts.map((name) => `  ${name}`)].join("\n");
}

/**
 * Branches gitevo never lists as an attempt and never deletes.
 *
 * The conventional names are all kept, not only the one this repository uses,
 * because a repository can carry more than one long lived branch.
 */
function keepBranches(root: string): Set<string> {
  return new Set(["main", "master", "trunk", rootBranchOf(root)]);
}

export function evo_diff(checkpoint_a: string, checkpoint_b: string): string {
  const root = initializedRoot();
  const from = requireTag(root, `evo-${checkpoint_a}`);
  const to = requireTag(root, `evo-${checkpoint_b}`);
  return git(["diff", from, to], root) || "No differences between checkpoints.";
}

function requireTag(root: string, tag: string): string {
  if (!evoTags(root).includes(tag)) throw new EvoError(`Checkpoint '${tag}' not found.`);
  return tag;
}

export function evo_summary(): string {
  const root = initializedRoot();
  const tags = evoTags(root);
  const dead = tags.filter((tag) => tag.startsWith(DEAD)).map((tag) => tag.slice(DEAD.length));
  const marks = tags.filter((tag) => !tag.startsWith(DEAD) && tag !== "evo-adopted");
  return [
    `Active branch: ${activeBranch(root)}`,
    `Checkpoints: ${marks.length}`,
    `Lessons: ${keepRecords(() => countMessages("INSIGHT", root)) ?? 0}`,
    deadLine(dead),
    `Adopted: ${tags.includes("evo-adopted") ? "yes" : "no"}`,
  ].join("\n");
}

function deadLine(dead: string[]): string {
  if (dead.length === 0) return "Dead branches: 0";
  return `Dead branches: ${dead.length} (${dead.join(", ")})`;
}

function markNames(root: string): string[] {
  return evoTags(root)
    .filter((tag) => !tag.startsWith(DEAD) && tag !== "evo-adopted")
    .map((tag) => tag.slice("evo-".length));
}

// ── Keeping and finishing ─────────────────────────────────────────────

export function evo_adopt(branch: string, cwdOverride?: string): string {
  const root = initializedRoot(cwdOverride);
  if (trackedChanges(root).length > 0) {
    throw new EvoError("Working tree is dirty. Please commit or stash changes first.");
  }
  if (!branchExists(root, branch)) throw new EvoError(`Branch '${branch}' not found.`);
  const target = rootBranchOf(root);
  git(["checkout", target], root);
  mergeOrAbort(root, branch);
  git(["tag", "-f", "-a", "evo-adopted", "-m", `adopted ${branch}`], root);
  keepRecords(() => recordBranch(branch, "adopted", undefined, undefined, root));
  return `Branch '${branch}' merged into '${target}' and tagged evo-adopted.`;
}

function trackedChanges(root: string): string[] {
  return statusLines(root).filter((line) => !line.startsWith("??"));
}

function mergeOrAbort(root: string, branch: string): void {
  if (gitTry(["merge", "--no-ff", "-m", `evo adopt ${branch}`, branch], root) !== null) return;
  const conflicted = gitTry(["diff", "--name-only", "--diff-filter=U"], root) ?? "";
  gitTry(["merge", "--abort"], root);
  const files = conflicted.split("\n").filter((line) => line.trim().length > 0);
  const named = files.length > 0 ? `: ${files.join(", ")}` : "";
  throw new EvoError(`adopt failed: merge conflicts${named}; resolve manually or abandon the branch`);
}

export function evo_finish(): string {
  const root = initializedRoot();
  const target = rootBranchOf(root);
  if (activeBranch(root) !== target) adoptInto(root, activeBranch(root));
  dropEvoTags(root);
  dropSideBranches(root, keepBranches(root));
  closeMemoryDb(root);
  fs.rmSync(path.join(root, ".evo"), { recursive: true, force: true });
  return `Evolution complete. All artifacts cleaned. Root branch: ${target}.`;
}

function adoptInto(root: string, branch: string): void {
  try {
    evo_adopt(branch, root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EvoError(`Finish failed: internal adopt failed - ${message}`);
  }
}

function dropEvoTags(root: string): void {
  const tags = evoTags(root);
  if (tags.length === 0) return;
  git(["tag", "-d", ...tags], root);
}

function dropSideBranches(root: string, keep: Set<string>): void {
  const others = branchNames(root).filter((name) => !keep.has(name));
  if (others.length === 0) return;
  gitTry(["branch", "-D", ...others], root);
}

// ── Shared ────────────────────────────────────────────────────────────

function joinReport(headline: string, extras: string[]): string {
  return [headline, ...extras.filter((extra) => extra.length > 0)].join("\n\n");
}

/**
 * Reach the durable record, and let it fail quietly.
 *
 * The git effect a record describes has already happened by the time the record
 * is written. A store that will not answer must not undo work the caller can
 * already see in the repository.
 */
function keepRecords<T>(reach: () => T): T | undefined {
  try {
    return reach();
  } catch {
    return undefined;
  }
}
