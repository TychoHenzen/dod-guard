import { type CoreCall, createPackagedCore } from "./application-core.test.js";
import type { FixtureBehavior } from "./packaged/behavior-state.test.js";
import { holdNext, waitForHeldReply } from "./packaged/fixture-delays.test.js";
import { forcedFailure } from "./packaged/fixture-failures.test.js";

export function createFixtureBehavior(coreCalls: CoreCall[]) {
  const state: FixtureBehavior = {
    failFocus: false,
    failRefresh: false,
    delays: new Map(),
  };
  const packagedCore = createPackagedCore(coreCalls);
  return {
    call: async (name: string, args: Record<string, unknown>) => {
      await waitForHeldReply(state, name, args);
      return forcedFailure(state, name, args) ?? packagedCore(name, args);
    },
    ...fixtureControls(state),
  };
}

function fixtureControls(state: FixtureBehavior) {
  return {
    failNextFocus: () => {
      state.failFocus = true;
    },
    failNextRefresh: () => {
      state.failRefresh = true;
    },
    holdNextLandmarks: () => holdNext(state, "landmarks"),
    holdNextFocus: (symbolId: string) => holdNext(state, `focus:${symbolId}`),
    holdNextRelation: (relation: string) =>
      holdNext(state, `relation:${relation}`),
  };
}
