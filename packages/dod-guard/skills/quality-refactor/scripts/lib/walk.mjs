// Source file discovery.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { IGNORED_DIRS, IGNORED_FILE_PATTERNS, LANG_BY_EXT, isTestPath } from "./config.mjs";

/** Normalize to forward slashes so output and baselines are OS-independent. */
function toPosix(p) {
  return p.split(sep).join("/");
}

function isIgnoredFile(name) {
  return IGNORED_FILE_PATTERNS.some((re) => re.test(name));
}

function collectInto(dir, root, excludes, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = toPosix(relative(root, full));
    if (excludes.some((frag) => rel.includes(frag))) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collectInto(full, root, excludes, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isIgnoredFile(entry.name)) continue;
    const lang = LANG_BY_EXT[extname(entry.name).toLowerCase()];
    if (!lang) continue;
    out.push({ path: full, rel, lang });
  }
}

/**
 * Collect scannable files under each target path. Targets may be files or
 * directories; `root` anchors the relative paths used in reports.
 */
export function collectFiles(targets, root, excludes) {
  const out = [];
  for (const target of targets) {
    let info;
    try {
      info = statSync(target);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      collectInto(target, root, excludes, out);
      continue;
    }
    const lang = LANG_BY_EXT[extname(target).toLowerCase()];
    if (lang) out.push({ path: target, rel: toPosix(relative(root, target)), lang });
  }
  const seen = new Set();
  return out.filter((file) => !seen.has(file.rel) && seen.add(file.rel));
}

/** Control bytes that never appear in hand-written source — binary guard. */
const BINARY_MARKER = /[\x00-\x08\x0e-\x1f]/;

/** Read each file and attach its raw text, line array, and test/prod role. */
export function loadFiles(files) {
  const loaded = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file.path, "utf8");
    } catch {
      continue;
    }
    if (BINARY_MARKER.test(source)) continue;
    loaded.push({
      ...file,
      source,
      lines: source.split(/\r?\n/),
      isTest: isTestPath(file.rel),
    });
  }
  return loaded;
}
