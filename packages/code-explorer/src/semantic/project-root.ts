import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createProjectRoot } from "./project-root-factory.js";
import type { FileIdentity } from "./project-root-file-identity.js";

export { ProjectPathError } from "./project-root-error.js";
export type { ProjectPathErrorCode } from "./project-root-error-code.js";
export { createProjectRoot } from "./project-root-factory.js";
export type { FileIdentity } from "./project-root-file-identity.js";
export type { ProjectFilesystem } from "./project-root-filesystem.js";
export type { ProjectRootOptions } from "./project-root-options.js";
export type { ProtectedPath } from "./project-root-protected-path.js";
export type { ProjectRoot } from "./project-root-type.js";

/** Uses host filesystem primitives for the process-owned startup root. */
export function createNativeProjectRoot(
  projectRoot?: string,
): import("./project-root-type.js").ProjectRoot<number> {
  return createProjectRoot({
    cwd: process.cwd(),
    projectRoot,
    platform: process.platform === "win32" ? "win32" : "posix",
    filesystem: {
      realpath: realpathSync.native,
      stat: (candidate) =>
        identityFromStat(statSync(candidate, { bigint: true })),
      open: (candidate) =>
        openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)),
      fstat: (handle) => identityFromStat(fstatSync(handle, { bigint: true })),
      read: (handle) => readFileSync(handle, "utf8"),
      close: closeSync,
    },
  });
}

function identityFromStat(stats: FileIdentity): FileIdentity {
  if (!(isStableIdentityPart(stats.dev) && isStableIdentityPart(stats.ino))) {
    throw new Error("unstable identity");
  }
  return { dev: stats.dev, ino: stats.ino };
}

function isStableIdentityPart(value: number | bigint): boolean {
  return typeof value === "bigint" || Number.isSafeInteger(value);
}
