import type { BackendFileIdentity } from "./backend-file-identity.js";
import { samePath } from "./backend-launch-paths.js";

export function sameEntrypoints(
  left: readonly BackendFileIdentity[] | undefined,
  right: readonly BackendFileIdentity[] | undefined,
  platform: "posix" | "win32",
): boolean {
  return (
    sameEntryCount(left, right) && everyEntryMatches(left, right, platform)
  );
}

function sameEntryCount(
  left: readonly BackendFileIdentity[] | undefined,
  right: readonly BackendFileIdentity[] | undefined,
): boolean {
  return (left?.length ?? 0) === (right?.length ?? 0);
}

function everyEntryMatches(
  left: readonly BackendFileIdentity[] | undefined,
  right: readonly BackendFileIdentity[] | undefined,
  platform: "posix" | "win32",
): boolean {
  return (left ?? []).every((file, index) =>
    sameEntry(file, right?.[index], platform),
  );
}

function sameEntry(
  file: BackendFileIdentity,
  other: BackendFileIdentity | undefined,
  platform: "posix" | "win32",
): boolean {
  if (!(other && file.canonical_path && other.canonical_path)) return false;
  if (!samePath(file.canonical_path, other.canonical_path, platform))
    return false;
  return sameFileCore(file, other);
}

export function sameFileCore(
  left: BackendFileIdentity,
  right: BackendFileIdentity,
): boolean {
  return (
    left.device === right.device &&
    left.file_id === right.file_id &&
    left.sha256 === right.sha256
  );
}
