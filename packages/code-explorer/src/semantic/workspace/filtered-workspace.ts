import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createNativeProjectRoot,
  type ProjectRoot,
} from "../project-root/project-root.js";
import { copyFilteredDirectory } from "./filtered-workspace-copy.js";
import { createOwnedServiceRoot } from "./service-root.js";

type FilteredWorkspace = {
  root: ProjectRoot<number>;
  sensitive_paths_excluded: number;
  sourcePaths(): readonly string[];
  dispose(): void;
};

/** Produces the sanitized tree a native source-reading backend receives. */
export function createFilteredWorkspace(
  sourceRoot: ProjectRoot,
): FilteredWorkspace {
  const service = createOwnedServiceRoot("code-explorer-native-");
  const treeRoot = join(service.path, "tree");
  const sourcePaths: string[] = [];
  try {
    mkdirSync(treeRoot);
    const excluded = copyFilteredDirectory({
      absoluteDirectory: sourceRoot.canonicalPath,
      relativeDirectory: "",
      serviceRoot: treeRoot,
      sourceRoot,
      sourcePaths,
    });
    return {
      root: createNativeProjectRoot(treeRoot),
      sensitive_paths_excluded: excluded,
      sourcePaths: () => [...sourcePaths],
      dispose: service.release,
    };
  } catch (error) {
    service.release();
    throw error;
  }
}
