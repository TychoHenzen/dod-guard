/**
 * Read the files an allow list points at, so the prompt context can show the
 * worker what it may touch.
 *
 * Only the directory prefix in front of the first wildcard is walked. A
 * pattern such as `src/**` never costs a scan of the whole repository.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { matchGlob } from "./solve-glob.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".evo"]);
const MAX_FILES = 20;
const MAX_DEPTH = 6;
const MAX_FILE_CHARS = 4000;

function patternRoot(pattern: string): string {
  const segments = pattern.split("/");
  const wildcard = segments.findIndex((s) => /[*?]/.test(s));
  const prefix = wildcard === -1 ? segments.slice(0, -1) : segments.slice(0, wildcard);
  return prefix.join("/");
}

function listFiles(root: string, dir: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(root, full, depth + 1));
    if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return found;
}

function isWildcard(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/**
 * A pattern with no wildcard names one file. The caller asked for it by name,
 * so it bypasses the skip filter that hides dot paths and build directories.
 */
function namedPaths(cwd: string, patterns: string[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    if (isWildcard(pattern)) continue;
    try {
      if (fs.statSync(path.join(cwd, pattern)).isFile()) found.push(pattern);
    } catch {
      // A pattern that names nothing contributes nothing.
    }
  }
  return found;
}

function candidatePaths(cwd: string, patterns: string[]): string[] {
  const roots = new Set(patterns.filter(isWildcard).map(patternRoot));
  const found = new Set<string>(namedPaths(cwd, patterns));
  for (const rel of roots) {
    try {
      for (const file of listFiles(cwd, path.join(cwd, rel), 0)) found.add(file);
    } catch {
      // Missing or unreadable prefix directory contributes nothing.
    }
  }
  return [...found];
}

/**
 * Return the contents of the files that match the allow list, capped so the
 * assembled context stays small. An absent allow list yields nothing.
 */
export function readAllowedFiles(cwd: string, patterns?: string[]): { path: string; content: string }[] {
  if (!patterns?.length) return [];

  const matched = candidatePaths(cwd, patterns).filter((f) => patterns.some((p) => matchGlob(f, p)));
  const files: { path: string; content: string }[] = [];

  for (const rel of matched.slice(0, MAX_FILES)) {
    try {
      files.push({ path: rel, content: fs.readFileSync(path.join(cwd, rel), "utf-8").slice(0, MAX_FILE_CHARS) });
    } catch {
      // Unreadable file contributes nothing.
    }
  }
  return files;
}
