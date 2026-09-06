import type { BackendFileIdentity } from "./backend-file-identity.js";
import type { BackendIdentity } from "./backend-identity.js";
import { sameEntrypoints, sameFileCore } from "./backend-launch-entrypoints.js";
import { samePath } from "./backend-launch-paths.js";
import { deepFreeze } from "./backend-launch-snapshot.js";

export function sameIdentity(
  left: Required<BackendIdentity>,
  right: Required<BackendIdentity>,
  platform: "posix" | "win32",
): boolean {
  if (!sameCoreIdentity(left, right, platform)) return false;
  if (!sameEntrypoints(left.entrypoints, right.entrypoints, platform))
    return false;
  return sameFileIdentity(
    left.package_metadata,
    right.package_metadata,
    platform,
  );
}

function sameCoreIdentity(
  left: Required<BackendIdentity>,
  right: Required<BackendIdentity>,
  platform: "posix" | "win32",
): boolean {
  return (
    samePath(left.canonical_path, right.canonical_path, platform) &&
    left.device === right.device &&
    left.file_id === right.file_id &&
    left.sha256 === right.sha256 &&
    left.version === right.version
  );
}

function sameFileIdentity(
  left: BackendFileIdentity | undefined,
  right: BackendFileIdentity | undefined,
  platform: "posix" | "win32",
): boolean {
  if (!(left && right)) return left === right;
  return sameFilePath(left, right, platform) && sameFileCore(left, right);
}

function sameFilePath(
  left: BackendFileIdentity,
  right: BackendFileIdentity,
  platform: "posix" | "win32",
): boolean {
  return Boolean(
    left.canonical_path &&
      right.canonical_path &&
      samePath(left.canonical_path, right.canonical_path, platform),
  );
}

export function resolveArguments(
  template: readonly string[],
  entrypoints: readonly BackendFileIdentity[] | undefined,
): readonly string[] {
  return deepFreeze(
    template.map((argument) => resolveArgument(argument, entrypoints)),
  );
}

function resolveArgument(
  argument: string,
  entrypoints: readonly BackendFileIdentity[] | undefined,
): string {
  const match = /^\{entrypoint:(\d+)\}$/.exec(argument);
  if (!match) return argument;
  const path = entrypoints?.[Number(match[1])]?.canonical_path;
  if (!path) throw new Error("backend_identity_unverifiable");
  return path;
}
