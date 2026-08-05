/**
 * What a destructive move would cost, worked out before the move happens.
 *
 * Three independent findings: source files tracked now and absent at the
 * destination, uncommitted files that look like source, and build output whose
 * source is gone. Which extensions count, which directories hold build output,
 * and whether the third finding runs at all come from the settings file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { EvoConfig } from "./evo-config.js";
import { EvoError } from "./evo-error.js";
import { gitTry } from "./evo-git.js";

interface MoveScope {
  root: string;
  target: string;
  status: string[];
  config: EvoConfig;
}

/** Build output extension to the source extensions that could have made it. */
const COMPILED_FROM: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"],
};

/** Every finding about the move, worst case first. Empty means it is safe. */
function evaluateMove(scope: MoveScope): string[] {
  const here = listTree(scope.root, "HEAD");
  const there = listTree(scope.root, scope.target);
  const dirs = buildDirs(scope);
  const outside = (file: string) => !inBuildDir(scope.root, dirs, file);
  const known = new Set([...here, ...untracked(scope.status)].map((file) => path.basename(file)));
  return [
    report(
      `Tracked source files that ${scope.target} does not have:`,
      missingSources(scope, here, there).filter(outside),
    ),
    report("Uncommitted files that look like source:", untrackedSources(scope).filter(outside)),
    report("Build output with no surviving source:", staleOutputs(scope, dirs, known)),
  ].filter((finding) => finding.length > 0);
}

function missingSources(scope: MoveScope, here: string[], there: string[]): string[] {
  const gone = here.filter((file) => !there.includes(file));
  return gone.filter((file) => isSource(file, scope.config));
}

/** Build output is reported by its own finding, never by the other two. */
function inBuildDir(root: string, dirs: string[], file: string): boolean {
  return dirs.some((dir) => file.startsWith(`${relative(root, dir)}/`));
}

/** Refuse the move unless it is safe or the caller accepted the risk. */
export function guardMove(scope: MoveScope, force?: boolean): string {
  const findings = evaluateMove(scope);
  if (findings.length === 0) return "";
  const detail = findings.join("\n\n");
  if (force) return detail;
  throw new EvoError(`${detail}\n\nNothing was changed. Pass force=true to move anyway.`);
}

function listTree(root: string, ref: string): string[] {
  const out = gitTry(["ls-tree", "-r", "--name-only", ref], root);
  if (out === null) throw new EvoError(`Reference '${ref}' not found.`);
  return out.split("\n").filter((line) => line.length > 0);
}

function isSource(file: string, config: EvoConfig): boolean {
  return config.sourceExtensions.includes(path.extname(file));
}

function changed(status: string[]): string[] {
  return status.map((line) => line.slice(3).split(" -> ").pop() ?? "").filter((file) => file.length > 0);
}

function untracked(status: string[]): string[] {
  return changed(status.filter((line) => line.startsWith("??")));
}

/**
 * Untracked files only. A tracked file that was edited survives the move in the
 * stash, so it is not at risk and must not refuse the move.
 */
function untrackedSources(scope: MoveScope): string[] {
  return untracked(scope.status).filter((file) => isSource(file, scope.config));
}

function staleOutputs(scope: MoveScope, dirs: string[], known: Set<string>): string[] {
  if (scope.config.skipStaleCheck) return [];
  const stale: string[] = [];
  for (const dir of dirs) {
    for (const file of walkFiles(dir)) {
      if (isStale(file, known, scope.config.sourceExtensions)) stale.push(relative(scope.root, file));
    }
  }
  return stale;
}

/**
 * Stale means: a compiled artifact whose source is gone.
 *
 * A test artifact is exempt in a repository that does not configure the
 * language it would have been compiled from, because there was never a source
 * for it to lose.
 */
function isStale(file: string, known: Set<string>, extensions: string[]): boolean {
  const extension = path.extname(file);
  const sources = COMPILED_FROM[extension] ?? [];
  const stem = path.basename(file, extension);
  if (!worthChecking(stem, sources, extensions)) return false;
  return !sources.some((candidate) => known.has(`${stem}${candidate}`));
}

function worthChecking(stem: string, sources: string[], extensions: string[]): boolean {
  if (sources.length === 0) return false;
  if (!isTest(stem)) return true;
  return sources.some((candidate) => extensions.includes(candidate));
}

function isTest(stem: string): boolean {
  return stem.endsWith(".test") || stem.endsWith(".spec");
}

function buildDirs(scope: MoveScope): string[] {
  return scope.config.buildLayouts.flatMap((layout) => expand(scope.root, layout)).filter(isDir);
}

function expand(root: string, layout: string): string[] {
  let here = [root];
  for (const segment of layout.split("/").filter((part) => part.length > 0)) {
    here = here.flatMap((base) => (segment === "*" ? childDirs(base) : [path.join(base, segment)]));
  }
  return here;
}

function childDirs(base: string): string[] {
  if (!isDir(base)) return [];
  return fs
    .readdirSync(base)
    .map((entry) => path.join(base, entry))
    .filter(isDir);
}

function isDir(target: string): boolean {
  return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

function walkFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules") continue;
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else found.push(full);
  }
  return found;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function report(headline: string, files: string[]): string {
  if (files.length === 0) return "";
  return [headline, ...files.map((file) => `  - ${file}`)].join("\n");
}
