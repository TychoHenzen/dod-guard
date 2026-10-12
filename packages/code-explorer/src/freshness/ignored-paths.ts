import { isAbsolute, relative, sep } from "node:path";

export const IGNORED_DIRECTORY_NAMES = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "dist-test",
  "coverage",
  "target",
  "obj",
] as const;

const IGNORED = new Set<string>(IGNORED_DIRECTORY_NAMES);

// The watcher and the manifest must agree, so both call this one predicate.
export function isIgnoredWorkspacePath(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]/u)
    .some((segment) => IGNORED.has(segment.toLowerCase()));
}

// Matching relative to the root keeps a project under an ancestor named
// dist or target from being ignored as a whole.
export function isIgnoredUnderRoot(
  root: string,
  absolutePath: string,
): boolean {
  const relativePath = relative(root, absolutePath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    return false;
  return isIgnoredWorkspacePath(relativePath);
}
