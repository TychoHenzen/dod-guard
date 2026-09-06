import type { ProjectRoot } from "../project-root/project-root.js";
import { createMirror } from "./python-mirror-generation.js";
import type { PythonMirrorApi } from "./python-mirror-runtime-types.js";
import { snapshotPythonProject } from "./python-mirror-snapshot.js";

export function createNativePythonMirror(
  root: ProjectRoot,
  generation = 0,
): PythonMirrorApi["mirror"] {
  return createMirror(root, generation, snapshotPythonProject(root));
}

export { createPythonMirrorManager } from "./python-mirror-manager.js";
export type { PythonMirrorApi } from "./python-mirror-runtime-types.js";
