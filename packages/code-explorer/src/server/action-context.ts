import type { FreshnessStatus } from "../freshness/workspace-freshness.js";
import type { RootAccessGate } from "../semantic/api/public-api.js";
import type { ServerRuntime } from "./server-runtime.js";
import type { ToolName } from "./tool-name.js";

export type ServerActionContext = {
  runtime: ServerRuntime;
  name: ToolName;
  arguments_: Record<string, unknown>;
  freshness: FreshnessStatus;
  rootStatus: Awaited<ReturnType<RootAccessGate["check"]>>;
};
