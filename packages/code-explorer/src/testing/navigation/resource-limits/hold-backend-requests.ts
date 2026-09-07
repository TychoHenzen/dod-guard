import type * as limits from "../../../navigation/resource-limits.js";
import { deferred } from "../../freshness/workspace-freshness/deferred.js";

export function holdBackendRequests(
  limiter: limits.BackendRequestLimiter,
  sessions: Array<string | undefined>,
) {
  const gate = deferred<void>();
  const active = sessions.map((session) =>
    limiter.run(session, () => gate.promise),
  );
  return {
    active,
    release: async () => {
      gate.resolve();
      await Promise.allSettled(active);
    },
  };
}
