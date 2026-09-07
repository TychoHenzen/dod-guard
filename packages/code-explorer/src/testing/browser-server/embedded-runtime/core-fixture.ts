import type { ExplorerCoreFactory } from "../../../browser-server/lifecycle.js";
export function runtimeCore(
  calls: Array<[string, Record<string, unknown>]>,
  onClose: () => void,
): ExplorerCoreFactory {
  const core = {
    async call(name: string, arguments_: Record<string, unknown>) {
      calls.push([name, arguments_]);
      return reply(name, arguments_);
    },
    async close() {
      onClose();
    },
  };
  return {
    async start() {
      return core;
    },
  };
}

function reply(name: string, arguments_: Record<string, unknown>) {
  const starting =
    name === "code_status" && arguments_.action === "start_session";
  return {
    schema_version: 1,
    project_id: "project",
    project_generation: 1,
    pending_generation: null,
    state: "ready",
    data: starting ? { session_id: "core-session" } : {},
  };
}
