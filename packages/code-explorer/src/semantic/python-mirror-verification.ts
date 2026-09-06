import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectRoot } from "./project-root.js";
import { sha256 } from "./python-mirror-path.js";
import type { PythonMirrorSnapshot } from "./python-mirror-snapshot.js";
import { mirrorTreeMatches } from "./python-mirror-tree.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";

export function expectedTreeFor(
  snapshot: PythonMirrorSnapshot,
): Map<string, string> {
  return new Map([
    ["pyrightconfig.json", sha256("{}\n")],
    ...snapshot.inputs.map((input) => [input.path, input.sha256] as const),
    ...Object.entries(BUNDLED_TYPESHED).map(
      ([path, text]) => [path, sha256(text)] as const,
    ),
  ]);
}

export function verifyMirrorPath(input: {
  path: string;
  root: ProjectRoot;
  mirrorRoot: string;
  expectedTree: ReadonlyMap<string, string>;
  manifest: ReadonlyMap<
    string,
    { original_sha256: string; mirror_sha256: string }
  >;
  disposed: boolean;
}): boolean {
  const expected = input.manifest.get(input.path);
  if (!expected || input.disposed) return false;
  try {
    return mirrorFilesMatch(input, expected);
  } catch {
    return false;
  }
}

function mirrorFilesMatch(
  input: {
    path: string;
    root: ProjectRoot;
    mirrorRoot: string;
    expectedTree: ReadonlyMap<string, string>;
  },
  expected: {
    original_sha256: string;
    mirror_sha256: string;
  },
): boolean {
  const original = input.root.protectedRead(input.path).bytes;
  const mirrorPath = join(input.mirrorRoot, input.path);
  if (lstatSync(mirrorPath).isSymbolicLink()) return false;
  return [
    mirrorTreeMatches(input.mirrorRoot, input.expectedTree),
    sha256(original) === expected.original_sha256,
    sha256(readFileSync(mirrorPath, "utf8")) === expected.mirror_sha256,
  ].every(Boolean);
}
