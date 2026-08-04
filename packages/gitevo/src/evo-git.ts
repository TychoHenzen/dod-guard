/**
 * The git process, and where the repository lives.
 *
 * Every gitevo operation starts by resolving the top level directory, so all
 * recorded state lands in <top level>/.evo even when the caller runs from a
 * nested directory. Arguments go to git as an argv array, never through a
 * shell, so nothing here has to escape anything.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { EvoError } from "./evo-error.js";

const NO_REPO = "Not a git repository. Run 'git init' first.";
const NO_EVO = "GitEvo not initialized. Run evo_init first.";
const ROOT_CANDIDATES = ["main", "master", "trunk"];

/** Run git and return its trimmed stdout. Any non-zero exit is an EvoError. */
export function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 60_000 });
  if (result.error) throw new EvoError(`git could not run: ${result.error.message}`);
  if (result.status !== 0) throw new EvoError(`git ${args.join(" ")} failed: ${complaint(result)}`);
  return (result.stdout || "").trim();
}

/** What git said about the failure. Some commands complain on stdout instead. */
function complaint(result: { stderr?: string | null; stdout?: string | null }): string {
  return (result.stderr || "").trim() || (result.stdout || "").trim();
}

/** Same as `git`, but a failure is an answer of null rather than a throw. */
export function gitTry(args: string[], cwd: string): string | null {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function lines(output: string): string[] {
  return output.split("\n").filter((line) => line.trim().length > 0);
}

/** The top level directory of the repository containing `cwd`. */
export function resolveRoot(cwd?: string): string {
  const top = gitTry(["rev-parse", "--show-toplevel"], cwd ?? process.cwd());
  if (top === null) throw new EvoError(NO_REPO);
  return path.normalize(top);
}

/** The top level directory, refusing when evo_init has not run there. */
export function initializedRoot(cwd?: string): string {
  const root = resolveRoot(cwd);
  if (!fs.existsSync(path.join(root, ".evo"))) throw new EvoError(NO_EVO);
  return root;
}

/** Porcelain status lines, one per path, untracked directories expanded. */
export function statusLines(root: string): string[] {
  return lines(git(["status", "--porcelain", "-uall"], root));
}

export function activeBranch(root: string): string {
  return git(["branch", "--show-current"], root) || "HEAD";
}

export function branchNames(root: string): string[] {
  return lines(git(["branch", "--format=%(refname:short)"], root));
}

export function branchExists(root: string, name: string): boolean {
  return branchNames(root).includes(name);
}

/** The branch the work returns to: the first conventional name that exists. */
export function rootBranchOf(root: string): string {
  const names = branchNames(root);
  return ROOT_CANDIDATES.find((candidate) => names.includes(candidate)) ?? activeBranch(root);
}

export function evoTags(root: string): string[] {
  return lines(git(["tag", "-l", "evo-*"], root));
}

/** The whole annotation body of a tag. Empty for a tag that carries none. */
export function tagDescription(root: string, tag: string): string {
  const raw = gitTry(["tag", "-l", "--format=%(objecttype)|%(contents)", tag], root) ?? "";
  const [kind, ...rest] = raw.split("|");
  return kind === "tag" ? rest.join("|").trim() : "";
}

/**
 * Put uncommitted work in the stash. Answers whether anything was stashed.
 *
 * A stash that will not run throws, because every caller is about to move the
 * tree. Carrying on would destroy the work this call exists to protect.
 */
export function setAside(root: string, status: string[]): boolean {
  if (status.length === 0) return false;
  return !git(["stash", "push", "-u", "-m", "gitevo auto-stash"], root).includes("No local changes");
}

/** Put stashed work back. Answers with the warning to report, or "". */
export function restoreAside(root: string, held: boolean): string {
  if (!held) return "";
  if (gitTry(["stash", "pop"], root) !== null) return "";
  return "Auto-stash could not be reapplied. The changes are recoverable: run 'git stash pop'.";
}
