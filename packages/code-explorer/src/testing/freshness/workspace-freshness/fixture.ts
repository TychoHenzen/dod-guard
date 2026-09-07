import {
  type ReconcileResult,
  WorkspaceFreshness,
} from "../../../freshness/workspace-freshness.js";
import { FakeTimers } from "./fake-timers.js";
import { FakeWatcher } from "./fake-watcher.js";

export function fixture(
  results: Array<ReconcileResult | Promise<ReconcileResult>>,
  watcher = new FakeWatcher(),
) {
  const timers = new FakeTimers();
  const freshness = new WorkspaceFreshness({
    reconcile: async () => {
      const result = results.shift();
      if (!result) throw new Error("missing_fixture_reconciliation");
      return await result;
    },
    createWatcher: () => watcher,
    setTimeout: timers.set,
    clearTimeout: timers.clear,
  });
  return { freshness, watcher, timers };
}
