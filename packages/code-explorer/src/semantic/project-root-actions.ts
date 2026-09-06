import * as path from "node:path";
import { isSensitiveProjectPath } from "../discovery/sensitive-paths.js";
import { ProjectPathError } from "./project-root-error.js";
import type { FileIdentity } from "./project-root-file-identity.js";
import {
  canonicalize,
  isRelativeProjectPath,
  normalize,
  sameCanonicalPath,
  sameIdentity,
} from "./project-root-identity.js";
import type { ProjectRootOptions } from "./project-root-options.js";

type CanonicalRoot = {
  path: string;
  identity: FileIdentity;
};

export function createRootActions<Handle>(input: {
  options: ProjectRootOptions<Handle>;
  configuredRoot: string;
  root: CanonicalRoot;
  pathApi: typeof path.win32 | typeof path.posix;
}): {
  isDescendant: (candidate: string) => boolean;
  assertRootStable: () => void;
  resolveClientPath: (relativePath: string) => string;
} {
  const isDescendant = (candidate: string): boolean =>
    isWithinRoot(candidate, input.root.path, input.options.platform);
  const assertRootStable = (): void =>
    assertStable(input.options, input.configuredRoot, input.root);
  const resolveClientPath = (relativePath: string): string =>
    resolvePath({ ...input, relativePath, isDescendant });
  return {
    isDescendant,
    assertRootStable,
    resolveClientPath,
  };
}

function isWithinRoot(
  candidate: string,
  root: string,
  platform: "win32" | "posix",
): boolean {
  const normalizedRoot = normalize(root, platform);
  const normalizedCandidate = normalize(candidate, platform);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function assertStable<Handle>(
  options: ProjectRootOptions<Handle>,
  configuredRoot: string,
  root: CanonicalRoot,
): void {
  const current = canonicalize(configuredRoot, options.filesystem);
  if (!current) throw new ProjectPathError("path_identity_unavailable");
  if (
    !(
      sameCanonicalPath(current.path, root.path, options.platform) &&
      sameIdentity(current.identity, root.identity)
    )
  )
    throw new ProjectPathError("path_identity_changed");
}

function resolvePath<Handle>(input: {
  options: ProjectRootOptions<Handle>;
  root: CanonicalRoot;
  pathApi: typeof path.win32 | typeof path.posix;
  relativePath: string;
  isDescendant: (candidate: string) => boolean;
}): string {
  if (
    !isRelativeProjectPath(input.relativePath, input.pathApi) ||
    isSensitiveProjectPath(input.relativePath)
  )
    throw new ProjectPathError("path_outside_project");
  const candidate = input.pathApi.resolve(input.root.path, input.relativePath);
  const resolved = canonicalize(candidate, input.options.filesystem);
  if (!(resolved && input.isDescendant(resolved.path)))
    throw new ProjectPathError("path_outside_project");
  return resolved.path;
}
