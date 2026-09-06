import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { ProjectRoot } from "../project-root/project-root.js";
import { sha256 } from "./python-mirror-path.js";
import type { PythonMirrorPlan } from "./python-mirror-plan.js";
import { mirrorTreeMatches, readRegularFile } from "./python-mirror-tree.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";

export function expectedTreeFor(
  plan: Extract<PythonMirrorPlan, { status: "ready" }>,
): Map<string, string> {
  return new Map([
    [
      "pyrightconfig.json",
      sha256(`${JSON.stringify(plan.minimal_pyrightconfig)}\n`),
    ],
    ...plan.files.map((file) => [file.path, file.sha256] as const),
    ...plan.bundled_typeshed.map((path) =>
      [
        path,
        sha256(
          (BUNDLED_TYPESHED as Readonly<Record<string, string>>)[path] ?? "",
        ),
      ] as const,
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
    sha256(readRegularFile(mirrorPath)) === expected.mirror_sha256,
  ].every(Boolean);
}
