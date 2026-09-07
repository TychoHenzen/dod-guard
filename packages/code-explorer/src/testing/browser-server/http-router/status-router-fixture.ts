import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
export function statusRouter(options: {
  generation: number;
  pending?: number | null;
  statusData?: Record<string, unknown>;
  now?: () => number;
  requireStatusName?: boolean;
}) {
  const { pending = null, statusData = {} } = options;
  return new BrowserHttpRouter({
    origin,
    clock: options.now && { nowMilliseconds: options.now },
    call: async (name, arguments_) => ({
      schema_version: 1,
      project_id: "p",
      project_generation: options.generation,
      pending_generation: pending,
      state: "ready",
      data: sessionRequest(name, arguments_, options.requireStatusName)
        ? { session_id: "core" }
        : statusData,
    }),
  });
}

function sessionRequest(
  name: string,
  arguments_: Record<string, unknown>,
  requireStatusName = false,
): boolean {
  if (requireStatusName && name !== "code_status") return false;
  return arguments_.action === "start_session";
}
