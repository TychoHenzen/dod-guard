import * as path from "node:path";
import type { FileIdentity } from "./project-root-file-identity.js";
import type { ProjectFilesystem } from "./project-root-filesystem.js";
import { canonicalize } from "./project-root-identity.js";

export function classifyBackendPath<Handle>(input: {
  candidate: string;
  filesystem: ProjectFilesystem<Handle>;
  root: { path: string; identity: FileIdentity };
  pathApi: typeof path.win32 | typeof path.posix;
  isDescendant(candidate: string): boolean;
}): { relative_path: string } | { external: true } {
  const portableCandidate = input.candidate.replaceAll("\\", "/");
  const candidatePath = input.pathApi.isAbsolute(portableCandidate)
    ? portableCandidate
    : input.pathApi.resolve(input.root.path, portableCandidate);
  const resolved = canonicalize(candidatePath, input.filesystem);
  if (!(resolved && input.isDescendant(resolved.path)))
    return { external: true };
  return {
    relative_path: input.pathApi
      .relative(input.root.path, resolved.path)
      .replaceAll("\\", "/"),
  };
}
