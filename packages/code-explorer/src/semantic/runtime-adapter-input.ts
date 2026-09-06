import type {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
} from "./adapter-selection.js";
import type { RelationCapabilities } from "./contract.js";
import type { ProjectRoot } from "./project-root.js";

export type RuntimeAdapterInput = {
  backend: ReturnType<
    typeof loadAdapterSelectionRecord
  >["runtime_backends"][number];
  projectRoot: ProjectRoot;
  platform: "win32" | "posix";
  policy: ReturnType<typeof createRuntimeLaunchPolicy>;
  capabilities: RelationCapabilities;
};
