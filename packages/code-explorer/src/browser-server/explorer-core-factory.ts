import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { ExplorerCore } from "./explorer-core.js";

export type ExplorerCoreFactory = {
  start(input: {
    projectRoot: ProjectRoot;
    signal: AbortSignal;
  }): Promise<ExplorerCore>;
};
