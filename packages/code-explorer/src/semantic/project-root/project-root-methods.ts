import type * as path from "node:path";
import { classifyBackendPath } from "./project-root-classify.js";
import type { FileIdentity } from "./project-root-file-identity.js";
import type { ProjectRootOptions } from "./project-root-options.js";
import { openProtected, protectedRead } from "./project-root-protected.js";

type RootMethodsInput<Handle> = {
  options: ProjectRootOptions<Handle>;
  root: { path: string; identity: FileIdentity };
  pathApi: typeof path.posix;
  actions: {
    resolveClientPath: (relativePath: string) => string;
    isDescendant: (candidate: string) => boolean;
    assertRootStable: () => void;
  };
};

export function rootMethods<Handle>(input: RootMethodsInput<Handle>) {
  return {
    resolveClientPath: input.actions.resolveClientPath,
    classifyBackendPath: (candidate: string) => classify(input, candidate),
    openProtected: (relativePath: string) => open(input, relativePath),
    protectedRead: (relativePath: string) => read(input, relativePath),
  };
}

function classify<Handle>(input: RootMethodsInput<Handle>, candidate: string) {
  return classifyBackendPath({
    candidate,
    filesystem: input.options.filesystem,
    root: input.root,
    pathApi: input.pathApi,
    isDescendant: input.actions.isDescendant,
  });
}

function open<Handle>(input: RootMethodsInput<Handle>, relativePath: string) {
  return openProtected({
    relativePath,
    options: input.options,
    root: input.root,
    resolveClientPath: input.actions.resolveClientPath,
    assertRootStable: input.actions.assertRootStable,
  });
}

function read<Handle>(input: RootMethodsInput<Handle>, relativePath: string) {
  return protectedRead({
    relativePath,
    options: input.options,
    root: input.root,
    resolveClientPath: input.actions.resolveClientPath,
    assertRootStable: input.actions.assertRootStable,
  });
}
