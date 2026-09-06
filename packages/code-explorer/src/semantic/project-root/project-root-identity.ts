import * as path from "node:path";
import { ProjectPathError } from "./project-root-error.js";
import type { FileIdentity } from "./project-root-file-identity.js";
import type { ProjectFilesystem } from "./project-root-filesystem.js";

export function canonicalize<Handle>(
  candidate: string,
  filesystem: ProjectFilesystem<Handle>,
): { path: string; identity: FileIdentity } | undefined {
  try {
    const resolved = filesystem.realpath(candidate);
    return {
      path: resolved,
      identity: identityFor(resolved, filesystem),
    };
  } catch {
    return undefined;
  }
}

export function identityFor<Handle>(
  candidate: string,
  filesystem: ProjectFilesystem<Handle>,
): FileIdentity {
  try {
    const identity = filesystem.stat(candidate);
    if (!stableIdentity(identity)) throw new Error("unstable identity");
    return identity;
  } catch {
    throw new ProjectPathError("path_identity_unavailable");
  }
}

export function identityForHandle<Handle>(
  handle: Handle,
  filesystem: ProjectFilesystem<Handle>,
): FileIdentity {
  try {
    const identity = filesystem.fstat(handle);
    if (!stableIdentity(identity)) throw new Error("unstable identity");
    return identity;
  } catch {
    throw new ProjectPathError("path_identity_unavailable");
  }
}

function stableIdentity(identity: FileIdentity): boolean {
  return (
    isStableIdentityPart(identity.dev) && isStableIdentityPart(identity.ino)
  );
}

function isStableIdentityPart(value: number | bigint): boolean {
  return typeof value === "bigint" || Number.isSafeInteger(value);
}

export function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.ino === right.ino &&
    (left.dev === right.dev || isZero(left.dev) || isZero(right.dev))
  );
}

function isZero(value: number | bigint): boolean {
  return value === 0 || value === BigInt(0);
}

export function sameCanonicalPath(
  left: string,
  right: string,
  platform: "win32" | "posix",
): boolean {
  return normalize(left, platform) === normalize(right, platform);
}

export function normalize(value: string, platform: "win32" | "posix"): string {
  const noExtendedPrefix =
    platform === "win32" && value.startsWith("\\\\?\\")
      ? value.slice(4)
      : value;
  const slashSeparated = noExtendedPrefix
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  return platform === "win32"
    ? slashSeparated.toLocaleLowerCase("en-US")
    : slashSeparated;
}

export function isRelativeProjectPath(
  value: string,
  pathApi: typeof path.win32 | typeof path.posix,
): boolean {
  return (
    value.length > 0 &&
    !pathApi.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}
