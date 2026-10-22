import { readdir } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".next",
  ".nyc_output",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  ".vs",
  ".vscode",
  "__pycache__",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "target",
  "vendor",
]);

const NON_MAINTAINED_DIRECTORY_NAMES = new Set([
  "archive",
  "archives",
  "dependencies",
  "dependency",
  "deps",
  "fixture",
  "fixtures",
  "generated",
  "snapshot",
  "snapshots",
  "test-fixtures",
  "test_fixtures",
]);

export function relative(root, file) {
  const value = path.relative(root, file);
  return value.length === 0 ? "." : value.split(path.sep).join("/");
}

export async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const groups = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isSymbolicLink()) return [];
        if (entry.isDirectory()) {
          if (SKIP_DIRECTORIES.has(entry.name.toLowerCase())) return [];
          return collectFiles(root, fullPath);
        }
        return entry.isFile() ? [fullPath] : [];
      }),
  );
  return groups.flat();
}

export function isMaintainedSource(file) {
  return file.split("/").every((segment) => !NON_MAINTAINED_DIRECTORY_NAMES.has(segment.toLowerCase()));
}
