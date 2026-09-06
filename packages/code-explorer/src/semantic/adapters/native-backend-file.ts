import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { BackendFileIdentity } from "../backend-launch/backend-file-identity.js";

export function inspectNativeFile(
  candidate: string,
  root: string,
  projectRoot?: string,
): BackendFileIdentity | undefined {
  try {
    const link = lstatSync(candidate);
    if (!link.isFile() || link.isSymbolicLink()) return undefined;
    const canonicalPath = realpathSync.native(candidate);
    if (!safeFilePath(root, canonicalPath, projectRoot)) return undefined;
    return inspectOpenedNativeFile(canonicalPath);
  } catch {
    return undefined;
  }
}

function inspectOpenedNativeFile(
  canonicalPath: string,
): BackendFileIdentity | undefined {
  const descriptor = openSync(canonicalPath, "r");
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    if (!stat.isFile()) return undefined;
    return {
      canonical_path: canonicalPath,
      device: String(stat.dev),
      file_id: String(stat.ino),
      sha256: createHash("sha256")
        .update(readFileSync(descriptor))
        .digest("hex"),
      regular_file: true,
      link_or_reparse_point: false,
    };
  } finally {
    closeSync(descriptor);
  }
}

function safeFilePath(
  root: string,
  candidate: string,
  projectRoot: string | undefined,
): boolean {
  return (
    isWithin(root, candidate) &&
    !(projectRoot && isWithin(projectRoot, candidate))
  );
}

export function isWithin(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || isChild(path);
}

function isChild(path: string): boolean {
  return !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path);
}
