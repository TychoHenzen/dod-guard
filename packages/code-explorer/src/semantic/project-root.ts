import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { isSensitiveProjectPath } from "../discovery/sensitive-paths.js";

export type FileIdentity = { dev: number | bigint; ino: number | bigint };

export type ProjectFilesystem<Handle = unknown> = {
  realpath(path: string): string;
  stat(path: string): FileIdentity;
  open(path: string, options: { noFollow: true }): Handle;
  fstat(handle: Handle): FileIdentity;
  read(handle: Handle): string;
  close(handle: Handle): void;
};

export type ProjectPathErrorCode =
  | "invalid_project_root"
  | "path_outside_project"
  | "path_identity_changed"
  | "path_identity_unavailable";

export class ProjectPathError extends Error {
  constructor(
    readonly code: ProjectPathErrorCode,
    readonly root_source?: "cwd" | "project_root",
  ) {
    super(code);
  }
}

export type ProjectRootOptions<Handle = unknown> = {
  cwd: string;
  projectRoot?: string;
  filesystem: ProjectFilesystem<Handle>;
  platform: "win32" | "posix";
};

export type ProtectedPath<Handle = unknown> = { path: string; handle: Handle };

export type ProjectRoot<Handle = unknown> = {
  canonicalPath: string;
  /** Revalidates the frozen startup root without revealing its host path. */
  revalidate(): "ready" | "inaccessible" | "unavailable";
  resolveClientPath(relativePath: string): string;
  classifyBackendPath(candidate: string): { relative_path: string } | { external: true };
  openProtected(relativePath: string): ProtectedPath<Handle>;
  protectedRead(relativePath: string): { path: string; bytes: string };
};

/**
 * Freezes a canonical project identity at startup. All later local paths are
 * resolved and checked against that identity before they can be read or used.
 */
export function createProjectRoot<Handle = unknown>(options: ProjectRootOptions<Handle>): ProjectRoot<Handle> {
  const pathApi = options.platform === "win32" ? path.win32 : path.posix;
  const configuredRoot = options.projectRoot ?? options.cwd;
  const root = canonicalize(configuredRoot, options.filesystem);
  if (!root) throw new ProjectPathError("invalid_project_root", options.projectRoot ? "project_root" : "cwd");

  const isDescendant = (candidate: string): boolean => {
    const normalizedRoot = normalize(root.path, options.platform);
    const normalizedCandidate = normalize(candidate, options.platform);
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
  };

  const assertRootStable = (): void => {
    const current = canonicalize(configuredRoot, options.filesystem);
    if (!current) throw new ProjectPathError("path_identity_unavailable");
    if (
      !(sameCanonicalPath(current.path, root.path, options.platform) && sameIdentity(current.identity, root.identity))
    ) {
      throw new ProjectPathError("path_identity_changed");
    }
  };

  const resolveClientPath = (relativePath: string): string => {
    if (!isRelativeProjectPath(relativePath, pathApi) || isSensitiveProjectPath(relativePath))
      throw new ProjectPathError("path_outside_project");
    const candidate = pathApi.resolve(root.path, relativePath);
    const resolved = canonicalize(candidate, options.filesystem);
    if (!(resolved && isDescendant(resolved.path))) throw new ProjectPathError("path_outside_project");
    return resolved.path;
  };

  return {
    canonicalPath: root.path,
    revalidate() {
      try {
        const path = options.filesystem.realpath(configuredRoot);
        const identity = options.filesystem.stat(path);
        if (!(isStableIdentityPart(identity.dev) && isStableIdentityPart(identity.ino))) return "unavailable";
        const current = { path, identity };
        return sameCanonicalPath(current.path, root.path, options.platform) &&
          sameIdentity(current.identity, root.identity)
          ? "ready"
          : "unavailable";
      } catch (error) {
        const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
        return code === "EACCES" || code === "EPERM" || code === "EBUSY" || code === "EIO"
          ? "inaccessible"
          : "unavailable";
      }
    },
    resolveClientPath,
    classifyBackendPath(candidate: string) {
      // Backends can report Windows separators even when the service runs elsewhere.
      // Interpret a relative backend location within the frozen project root.
      const portableCandidate = candidate.replaceAll("\\", "/");
      const candidatePath = pathApi.isAbsolute(portableCandidate)
        ? portableCandidate
        : pathApi.resolve(root.path, portableCandidate);
      const resolved = canonicalize(candidatePath, options.filesystem);
      if (!(resolved && isDescendant(resolved.path))) return { external: true };
      return { relative_path: pathApi.relative(root.path, resolved.path).replaceAll("\\", "/") };
    },
    openProtected(relativePath: string): ProtectedPath<Handle> {
      assertRootStable();
      const checkedPath = resolveClientPath(relativePath);
      const checkedIdentity = identityFor(checkedPath, options.filesystem);
      let handle: Handle | undefined;
      try {
        handle = options.filesystem.open(checkedPath, { noFollow: true });
        const openedIdentity = identityForHandle(handle, options.filesystem);
        assertRootStable();
        const finalIdentity = identityFor(checkedPath, options.filesystem);
        if (!(sameIdentity(checkedIdentity, openedIdentity) && sameIdentity(checkedIdentity, finalIdentity))) {
          throw new ProjectPathError("path_identity_changed");
        }
        return { path: checkedPath, handle };
      } catch (error) {
        if (handle !== undefined) options.filesystem.close(handle);
        if (error instanceof ProjectPathError) throw error;
        throw new ProjectPathError("path_identity_unavailable");
      }
    },
    protectedRead(relativePath: string): { path: string; bytes: string } {
      const protectedPath = this.openProtected(relativePath);
      try {
        const bytes = options.filesystem.read(protectedPath.handle);
        assertRootStable();
        const finalPath = canonicalize(protectedPath.path, options.filesystem);
        if (
          !(
            finalPath &&
            sameCanonicalPath(finalPath.path, protectedPath.path, options.platform) &&
            sameIdentity(finalPath.identity, identityForHandle(protectedPath.handle, options.filesystem))
          )
        ) {
          throw new ProjectPathError("path_identity_changed");
        }
        return { path: protectedPath.path, bytes };
      } finally {
        options.filesystem.close(protectedPath.handle);
      }
    },
  };
}

/** Uses host filesystem primitives for the process-owned startup root. */
export function createNativeProjectRoot(projectRoot?: string): ProjectRoot<number> {
  return createProjectRoot({
    cwd: process.cwd(),
    projectRoot,
    platform: process.platform === "win32" ? "win32" : "posix",
    filesystem: {
      realpath: realpathSync.native,
      stat: (candidate) => identityFromStat(statSync(candidate, { bigint: true })),
      open: (candidate) => openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)),
      fstat: (handle) => identityFromStat(fstatSync(handle, { bigint: true })),
      read: (handle) => readFileSync(handle, "utf8"),
      close: closeSync,
    },
  });
}

function canonicalize<Handle>(
  candidate: string,
  filesystem: ProjectFilesystem<Handle>,
): { path: string; identity: FileIdentity } | undefined {
  try {
    const resolved = filesystem.realpath(candidate);
    return { path: resolved, identity: identityFor(resolved, filesystem) };
  } catch {
    return undefined;
  }
}

function identityFor<Handle>(candidate: string, filesystem: ProjectFilesystem<Handle>): FileIdentity {
  try {
    const identity = filesystem.stat(candidate);
    if (!(isStableIdentityPart(identity.dev) && isStableIdentityPart(identity.ino)))
      throw new Error("unstable identity");
    return identity;
  } catch {
    throw new ProjectPathError("path_identity_unavailable");
  }
}

function identityForHandle<Handle>(handle: Handle, filesystem: ProjectFilesystem<Handle>): FileIdentity {
  try {
    const identity = filesystem.fstat(handle);
    if (!(isStableIdentityPart(identity.dev) && isStableIdentityPart(identity.ino)))
      throw new Error("unstable identity");
    return identity;
  } catch {
    throw new ProjectPathError("path_identity_unavailable");
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  // Windows `stat` can report dev as zero while `fstat` reports a volume value
  // for the same opened file. In that case ino remains the stable identity.
  return left.ino === right.ino && (left.dev === right.dev || isZero(left.dev) || isZero(right.dev));
}

function isZero(value: number | bigint): boolean {
  return value === 0 || value === BigInt(0);
}

function identityFromStat(stats: { dev: number | bigint; ino: number | bigint }): FileIdentity {
  if (!(isStableIdentityPart(stats.dev) && isStableIdentityPart(stats.ino))) throw new Error("unstable identity");
  return { dev: stats.dev, ino: stats.ino };
}

function isStableIdentityPart(value: number | bigint): boolean {
  return typeof value === "bigint" || Number.isSafeInteger(value);
}

function sameCanonicalPath(left: string, right: string, platform: "win32" | "posix"): boolean {
  return normalize(left, platform) === normalize(right, platform);
}

function normalize(value: string, platform: "win32" | "posix"): string {
  const noExtendedPrefix = platform === "win32" ? value.replace(/^\\\\\?\\/, "") : value;
  const slashSeparated = noExtendedPrefix.replaceAll("\\", "/").replace(/\/+$/, "");
  return platform === "win32" ? slashSeparated.toLocaleLowerCase("en-US") : slashSeparated;
}

function isRelativeProjectPath(value: string, pathApi: typeof path.win32 | typeof path.posix): boolean {
  return value.length > 0 && !pathApi.isAbsolute(value) && !value.split(/[\\/]/).includes("..");
}
