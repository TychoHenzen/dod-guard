import {
  type ReconcileResult,
  WorkspaceFreshness,
} from "../../../freshness/workspace-freshness.js";
import { deferred } from "./deferred.js";
import { manifest } from "./manifest.js";

export function pendingPublicationFixture(
  next: ReturnType<typeof deferred<ReconcileResult>>,
) {
  const captured = [
    manifest({ "src/a.ts": "one" }),
    manifest({ "src/a.ts": "two" }),
  ];
  const verified: Array<ReconcileResult | Promise<ReconcileResult>> = [
    manifest({ "src/a.ts": "one" }),
    next.promise,
  ];
  const freshness = new WorkspaceFreshness({
    reconcile: async () => captured.shift() ?? manifest({ "src/a.ts": "two" }),
    verify: async () =>
      await (verified.shift() ?? manifest({ "src/a.ts": "two" })),
  });
  return { freshness };
}
