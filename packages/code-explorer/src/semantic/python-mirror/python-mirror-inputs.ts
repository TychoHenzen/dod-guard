import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isClassificationConfigPath } from "../../discovery/config-path.js";
import { isSensitiveProjectPath } from "../../discovery/sensitive-paths.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import { samePath } from "./python-mirror-path.js";

export function collectPythonFiles(root: ProjectRoot): string[] {
  return visit(root, root.canonicalPath, "");
}

function visit(
  root: ProjectRoot,
  directory: string,
  relativeDirectory: string,
): string[] {
  return readdirSync(directory, {
    withFileTypes: true,
  }).flatMap((entry) =>
    visitEntry({
      root,
      directory,
      relativeDirectory,
      entry,
    }),
  );
}

function visitEntry(input: {
  root: ProjectRoot;
  directory: string;
  relativeDirectory: string;
  entry: Dirent<string>;
}): string[] {
  const absolute = join(input.directory, input.entry.name);
  const relativePath = input.relativeDirectory
    ? `${input.relativeDirectory}/${input.entry.name}`
    : input.entry.name;
  if (lstatSync(absolute).isSymbolicLink())
    throw new Error("unsafe_backend_mode");
  if (input.entry.isDirectory())
    return visitDirectory(input.root, absolute, relativePath);
  if (!input.entry.isFile()) return [];
  return visitPythonFile(input.root, absolute, relativePath);
}

function visitPythonFile(
  root: ProjectRoot,
  absolute: string,
  relativePath: string,
): string[] {
  if (!isPythonFile(relativePath)) return [];
  const resolved = root.resolveClientPath(relativePath);
  if (!samePath(resolved, absolute)) throw new Error("unsafe_backend_mode");
  return [relativePath];
}

function visitDirectory(
  root: ProjectRoot,
  absolute: string,
  relativePath: string,
): string[] {
  return isExcludedPythonDirectory(relativePath)
    ? []
    : visit(root, absolute, relativePath);
}

function isPythonFile(path: string): boolean {
  return (
    (path.endsWith(".py") || path.endsWith(".pyi")) &&
    !isSensitiveProjectPath(path) &&
    !isClassificationConfigPath(path)
  );
}

function isExcludedPythonDirectory(path: string): boolean {
  return (
    isSensitiveProjectPath(path) ||
    path
      .split("/")
      .some((part) => /^(\.venv|venv|node_modules|__pycache__)$/iu.test(part))
  );
}
