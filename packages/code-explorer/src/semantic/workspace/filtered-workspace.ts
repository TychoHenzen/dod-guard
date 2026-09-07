import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNativeProjectRoot,
  type ProjectRoot,
} from "../project-root/project-root.js";
import { copyFilteredDirectory } from "./filtered-workspace-copy.js";

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
  const serviceRoot = mkdtempSync(join(tmpdir(), "code-explorer-native-"));
  const sourcePaths: string[] = [];
  try {
    const excluded = copyFilteredDirectory({
      absoluteDirectory: sourceRoot.canonicalPath,
      relativeDirectory: "",
      serviceRoot,
      sourceRoot,
      sourcePaths,
    });
    return {
      root: createNativeProjectRoot(serviceRoot),
      sensitive_paths_excluded: excluded,
      sourcePaths: () => [...sourcePaths],
      dispose: () => disposeWorkspace(serviceRoot),
    };
  } catch (error) {
    disposeWorkspace(serviceRoot);
    throw error;
  }
}

function disposeWorkspace(serviceRoot: string): void {
  if (existsSync(serviceRoot))
    rmSync(serviceRoot, { recursive: true, force: true });
}
