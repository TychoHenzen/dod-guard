import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";

export function changingFreshness() {
  const manifests = [
    new Map([["src/lib.rs", "one"]]),
    new Map([["src/lib.rs", "two"]]),
  ];
  const freshness = new WorkspaceFreshness({
    reconcile: async () => ({ manifest: manifests.shift() ?? new Map() }),
  });
  return { freshness };
}
