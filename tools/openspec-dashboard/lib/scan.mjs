// scan.mjs - find candidate OpenSpec projects under bounded roots.
//
// Bounded on purpose: only the configured roots, only three levels down, and
// never into dependency or build output. A directory holding openspec/ is a
// project, so the walk stops there rather than searching inside it.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isProject } from "./registry.mjs";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", "target", "vendor", "AppData"]);
const MAX_DEPTH = 3;

function childDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name) && !entry.name.startsWith("."))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

function walk(dir, depth, found) {
  if (isProject(dir)) {
    found.push(dir.replace(/\\/g, "/"));
    return;
  }
  if (depth >= MAX_DEPTH) return;
  for (const child of childDirs(dir)) walk(child, depth + 1, found);
}

export function scan(roots) {
  const found = [];
  for (const root of roots) walk(root, 0, found);
  return [...new Set(found)].sort();
}
