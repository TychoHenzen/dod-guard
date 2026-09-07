import { ProjectPathError } from "./project-root-error.js";
import type { FileIdentity } from "./project-root-file-identity.js";
import type { ProjectFilesystem } from "./project-root-filesystem.js";
import {
  canonicalize,
  identityFor,
  identityForHandle,
  sameCanonicalPath,
  sameIdentity,
} from "./project-root-identity.js";

type RootSnapshot = {
  path: string;
  identity: FileIdentity;
};

export function openProtected<Handle>(input: {
  relativePath: string;
  options: { filesystem: ProjectFilesystem<Handle> };
  root: RootSnapshot;
  resolveClientPath(relativePath: string): string;
  assertRootStable(): void;
}): { path: string; handle: Handle } {
  input.assertRootStable();
  const checkedPath = input.resolveClientPath(input.relativePath);
  const checkedIdentity = identityFor(checkedPath, input.options.filesystem);
  let handle: Handle | undefined;
  try {
    handle = input.options.filesystem.open(checkedPath, {
      noFollow: true,
    });
    const openedIdentity = identityForHandle(handle, input.options.filesystem);
    input.assertRootStable();
    const finalIdentity = identityFor(checkedPath, input.options.filesystem);
    if (
      !(
        sameIdentity(checkedIdentity, openedIdentity) &&
        sameIdentity(checkedIdentity, finalIdentity)
      )
    )
      throw new ProjectPathError("path_identity_changed");
    return { path: checkedPath, handle };
  } catch (error) {
    if (handle !== undefined) input.options.filesystem.close(handle);
    if (error instanceof ProjectPathError) throw error;
    throw new ProjectPathError("path_identity_unavailable");
  }
}

export function protectedRead<Handle>(input: {
  relativePath: string;
  options: {
    filesystem: ProjectFilesystem<Handle>;
    platform: "win32" | "posix";
  };
  root: RootSnapshot;
  resolveClientPath(relativePath: string): string;
  assertRootStable(): void;
}): { path: string; bytes: string } {
  const protectedPath = openProtected(input);
  try {
    const bytes = input.options.filesystem.read(protectedPath.handle);
    input.assertRootStable();
    const finalPath = canonicalize(
      protectedPath.path,
      input.options.filesystem,
    );
    if (!sameFinalPath(finalPath, protectedPath, input))
      throw new ProjectPathError("path_identity_changed");
    return { path: protectedPath.path, bytes };
  } finally {
    input.options.filesystem.close(protectedPath.handle);
  }
}

function sameFinalPath<Handle>(
  finalPath: RootSnapshot | undefined,
  protectedPath: { path: string; handle: Handle },
  input: {
    options: {
      filesystem: ProjectFilesystem<Handle>;
      platform: "win32" | "posix";
    };
  },
): boolean {
  return Boolean(
    finalPath &&
      sameCanonicalPath(
        finalPath.path,
        protectedPath.path,
        input.options.platform,
      ) &&
      sameIdentity(
        finalPath.identity,
        identityForHandle(protectedPath.handle, input.options.filesystem),
      ),
  );
}
