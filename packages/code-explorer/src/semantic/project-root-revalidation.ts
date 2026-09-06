import type { FileIdentity } from "./project-root-file-identity.js";
import type { ProjectFilesystem } from "./project-root-filesystem.js";
import { sameCanonicalPath, sameIdentity } from "./project-root-identity.js";

export function revalidateRoot<Handle>(
  options: {
    platform: "win32" | "posix";
    filesystem: ProjectFilesystem<Handle>;
  },
  configuredRoot: string,
  root: { path: string; identity: FileIdentity },
): "ready" | "inaccessible" | "unavailable" {
  try {
    const current = currentIdentity(options.filesystem, configuredRoot);
    return sameRoot(current, root, options.platform) ? "ready" : "unavailable";
  } catch (error) {
    return isInaccessible(error) ? "inaccessible" : "unavailable";
  }
}

function isInaccessible(error: unknown): boolean {
  if (!(error instanceof Error && "code" in error)) return false;
  const code = (error as { code?: string }).code;
  return ["EACCES", "EPERM", "EBUSY", "EIO"].includes(code ?? "");
}

function currentIdentity<Handle>(
  filesystem: ProjectFilesystem<Handle>,
  configuredRoot: string,
): { path: string; identity: FileIdentity } {
  const path = filesystem.realpath(configuredRoot);
  const identity = filesystem.stat(path);
  if (
    !(
      (typeof identity.dev === "bigint" ||
        Number.isSafeInteger(identity.dev)) &&
      (typeof identity.ino === "bigint" || Number.isSafeInteger(identity.ino))
    )
  )
    throw new Error("unstable identity");
  return { path, identity };
}

function sameRoot(
  current: { path: string; identity: FileIdentity },
  root: { path: string; identity: FileIdentity },
  platform: "win32" | "posix",
): boolean {
  return (
    sameCanonicalPath(current.path, root.path, platform) &&
    sameIdentity(current.identity, root.identity)
  );
}
