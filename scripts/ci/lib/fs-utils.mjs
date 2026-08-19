// Shared filesystem helpers for the CI gate scripts.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Directories that are generated, vendored, or otherwise not source. */
export const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".quality"]);

export function listDir(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => predicate(join(dir, entry)));
}

/** Every file under `dir`, skipping IGNORED_DIRS. Returns absolute paths. */
export function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) out.push(...walkFiles(full));
    } else out.push(full);
  }
  return out;
}

export function toPosix(root, file) {
  return relative(root, file).split("\\").join("/");
}

/** Minimal frontmatter reader — top-level scalar keys only, enough for name/description. */
export function readFrontmatter(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

export function walkStrings(value, visit, path = "") {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      walkStrings(item, visit, `${path}[${i}]`);
    });
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walkStrings(item, visit, path ? `${path}.${key}` : key);
  }
}
