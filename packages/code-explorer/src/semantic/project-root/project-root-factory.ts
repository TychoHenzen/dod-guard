import * as path from "node:path";
import { createRootActions } from "./project-root-actions.js";
import { ProjectPathError } from "./project-root-error.js";
import { canonicalize } from "./project-root-identity.js";
import { rootMethods } from "./project-root-methods.js";
import type { ProjectRootOptions } from "./project-root-options.js";
import { revalidateRoot } from "./project-root-revalidation.js";
import type { ProjectRoot } from "./project-root-type.js";

export function createProjectRoot<Handle = unknown>(
  options: ProjectRootOptions<Handle>,
): ProjectRoot<Handle> {
  return buildProjectRoot(options, rootContext(options));
}

function rootContext<Handle>(options: ProjectRootOptions<Handle>) {
  const pathApi = rootPathApi(options.platform);
  const configuredRoot = configuredRootFor(options);
  const root = canonicalize(configuredRoot, options.filesystem);
  if (!root)
    throw new ProjectPathError(
      "invalid_project_root",
      options.projectRoot ? "project_root" : "cwd",
    );
  return {
    configuredRoot,
    root,
    pathApi,
    actions: createRootActions({
      options,
      configuredRoot,
      root,
      pathApi,
    }),
  };
}

function rootPathApi(platform: "win32" | "posix") {
  return platform === "win32" ? path.win32 : path.posix;
}

function configuredRootFor<Handle>(
  options: ProjectRootOptions<Handle>,
): string {
  return options.projectRoot ?? options.cwd;
}

function buildProjectRoot<Handle>(
  options: ProjectRootOptions<Handle>,
  context: ReturnType<typeof rootContext<Handle>>,
): ProjectRoot<Handle> {
  const { root, configuredRoot, pathApi, actions } = context;
  return {
    canonicalPath: root.path,
    revalidate: () => revalidateRoot(options, configuredRoot, root),
    ...rootMethods({ options, root, pathApi, actions }),
  };
}
