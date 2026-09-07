import type { loadAdapterSelectionRecord } from "../adapter-selection/index.js";
import type { BackendLaunchPolicy } from "../backend-launch/types.js";
import type { RelationCapabilities } from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";

export type RuntimeAdapterInput = {
  backend: ReturnType<
    typeof loadAdapterSelectionRecord
  >["runtime_backends"][number];
  projectRoot: ProjectRoot;
  platform: "win32" | "posix";
  policy: BackendLaunchPolicy;
  capabilities: RelationCapabilities;
};
