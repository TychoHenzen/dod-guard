// Source file discovery.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import {
  IGNORED_DIRS,
  IGNORED_FILE_PATTERNS,
  LANG_BY_EXT,
  isTestPath,
} from "./config.mjs";
import { collectTarget } from "./walk-target.mjs";

/** Control bytes never found in hand-written source.
 * This is the binary guard. */
const BINARY_MARKER = /[\x00-\x08\x0e-\x1f]/;

/** Normalize to forward slashes so output and baselines are OS-independent. */
function toPosix(p) {
  return p.split(sep).join("/");
}

/** Read a text file, or return null when it is unreadable or binary. */
export function readText(path) {
  try {
    const text = readFileSync(path, "utf8");
    return BINARY_MARKER.test(text) ? null : text;
  } catch {
    return null;
  }
}

/**
 * Recursive descent honoring `IGNORED_DIRS` and `ctx.excludes`. Calls
 * `onFile(entry, full, rel)` visits every plain file. `ctx` is
 * `{ root, excludes }`.
 */
function visitEntry({ dir, ctx, onFile, entry }) {
  const full = join(dir, entry.name);
  const rel = toPosix(relative(ctx.root, full));
  if (ctx.excludes.some((frag) => rel.includes(frag))) return;
  if (entry.isDirectory()) {
    if (!IGNORED_DIRS.has(entry.name)) walkDir(full, ctx, onFile);
    return;
  }
  if (entry.isFile()) onFile(entry, full, rel);
}

export function walkDir(dir, ctx, onFile) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) visitEntry({ dir, ctx, onFile, entry });
}

/**
 * Collect scannable files under each target path. Targets may be files or
 * directories. `root` anchors the relative paths used in reports.
 */
export function collectFiles(targets, root, excludes) {
  const out = [];
  const take = (entry, full, rel) => {
    if (IGNORED_FILE_PATTERNS.some((re) => re.test(entry.name))) return;
    const lang = LANG_BY_EXT[extname(entry.name).toLowerCase()];
    if (lang) out.push({ path: full, rel, lang });
  };
  for (const target of targets)
    collectTarget({ target, root, excludes, take, out, walk: walkDir });
  const seen = new Set();
  return out.filter((file) => !seen.has(file.rel) && seen.add(file.rel));
}

/**
 * Read each file and attach its raw text, line array, and test/prod role.
 * `testPaths` are repo-declared test-support fragments (`--test-path`).
 */
export function loadFiles(files, testPaths = []) {
  const loaded = [];
  for (const file of files) {
    const source = readText(file.path);
    if (source === null) continue;
    loaded.push({
      ...file,
      source,
      lines: source.split(/\r?\n/),
      isTest: isTestPath(file.rel, testPaths),
    });
  }
  return loaded;
}
