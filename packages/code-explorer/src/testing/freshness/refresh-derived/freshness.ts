import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";

export function freshness(): WorkspaceFreshness {
  let revision = 0;
  return new WorkspaceFreshness({
    reconcile: async () => ({
      manifest: new Map([["src/lib.rs", String(revision++)]]),
    }),
  });
}
