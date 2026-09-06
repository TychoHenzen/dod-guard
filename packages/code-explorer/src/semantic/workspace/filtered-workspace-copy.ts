import {
  type Dirent,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isClassificationConfigPath } from "../../discovery/config-path.js";
import { isSensitiveProjectPath } from "../../discovery/sensitive-paths.js";
import {
  isBackendIrrelevant,
  isBackendSourceFile,
  relativePathFor,
} from "./filtered-workspace-rules.js";
import type { ProjectRoot } from "../project-root/project-root.js";

export function copyFilteredDirectory(input: {
  absoluteDirectory: string;
  relativeDirectory: string;
  serviceRoot: string;
  sourceRoot: ProjectRoot;
  sourcePaths: string[];
}): number {
  return readdirSync(input.absoluteDirectory, {
    withFileTypes: true,
  }).reduce(
    (excluded, entry) => excluded + copyFilteredEntry({ ...input, entry }),
    0,
  );
}

function copyFilteredEntry(input: {
  absoluteDirectory: string;
  relativeDirectory: string;
  serviceRoot: string;
  sourceRoot: ProjectRoot;
  sourcePaths: string[];
  entry: Dirent<string>;
}): number {
  const relativePath = relativePathFor(
    input.relativeDirectory,
    input.entry.name,
  );
  const reason = skipReason(
    relativePath,
    input.absoluteDirectory,
    input.entry.name,
  );
  if (reason === "sensitive") return 1;
  if (reason) return 0;
  if (input.entry.isDirectory()) return copyDirectory(input, relativePath);
  copySource(input, relativePath);
  return 0;
}

function copyDirectory(
  input: Parameters<typeof copyFilteredEntry>[0],
  relativePath: string,
): number {
  const target = join(input.serviceRoot, relativePath);
  mkdirSync(target, { recursive: true });
  return copyFilteredDirectory({
    ...input,
    absoluteDirectory: join(input.absoluteDirectory, input.entry.name),
    relativeDirectory: relativePath,
  });
}

function copySource(
  input: Parameters<typeof copyFilteredEntry>[0],
  relativePath: string,
): void {
  if (!(input.entry.isFile() && isBackendSourceFile(relativePath))) return;
  const target = join(input.serviceRoot, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    input.sourceRoot.protectedRead(relativePath).bytes,
    "utf8",
  );
  input.sourcePaths.push(relativePath);
}

function skipReason(
  relativePath: string,
  absoluteDirectory: string,
  name: string,
): "sensitive" | "ignored" | undefined {
  if (isSensitiveProjectPath(relativePath)) return "sensitive";
  if (isClassificationConfigPath(relativePath)) return "ignored";
  if (isBackendIrrelevant(relativePath)) return "ignored";
  if (lstatSync(join(absoluteDirectory, name)).isSymbolicLink())
    return "ignored";
  return undefined;
}
