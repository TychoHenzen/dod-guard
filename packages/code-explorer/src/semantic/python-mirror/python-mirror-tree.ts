import {
  closeSync,
  fstatSync,
  type Dirent,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { sha256 } from "./python-mirror-path.js";

export function mirrorTreeMatches(
  root: string,
  expected: ReadonlyMap<string, string>,
): boolean {
  try {
    const actual = new Map<string, string>();
    collectTree(root, "", actual);
    return (
      actual.size === expected.size &&
      [...expected].every(([path, digest]) => actual.get(path) === digest)
    );
  } catch {
    return false;
  }
}

function collectTree(
  directory: string,
  relativeDirectory: string,
  actual: Map<string, string>,
): void {
  for (const entry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    collectEntry({
      directory,
      relativeDirectory,
      actual,
      entry,
    });
  }
}

function collectEntry(input: {
  directory: string;
  relativeDirectory: string;
  actual: Map<string, string>;
  entry: Dirent<string>;
}): void {
  const path = join(input.directory, input.entry.name);
  const relativePath = input.relativeDirectory
    ? `${input.relativeDirectory}/${input.entry.name}`
    : input.entry.name;
  if (lstatSync(path).isSymbolicLink()) throw new Error("link");
  if (input.entry.isDirectory()) {
    collectTree(path, relativePath, input.actual);
    return;
  }
  if (input.entry.isFile()) {
    input.actual.set(relativePath, sha256(readRegularFile(path)));
    return;
  }
  throw new Error("unsupported");
}

export function readRegularFile(path: string): string {
  const descriptor = openSync(path, "r");
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error("unsupported");
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}
