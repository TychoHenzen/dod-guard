import { type CoreCall, createPackagedCore } from "./application-core.test.js";

type FixtureBehavior = { failFocus: boolean; failRefresh: boolean; delays: Map<string, Promise<void>> };

function delayKey(name: string, arguments_: Record<string, unknown>): string | undefined {
  if (name === "code_search" && arguments_.query === "") return "landmarks";
  if (name === "code_focus" && typeof arguments_.symbol_id === "string") return `focus:${arguments_.symbol_id}`;
  if (name === "code_follow" && typeof arguments_.relation === "string") return `relation:${arguments_.relation}`;
}

function holdNext(behavior: FixtureBehavior, key: string): () => void {
  let release: () => void = () => {};
  behavior.delays.set(
    key,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  return release;
}

export function createFixtureBehavior(coreCalls: CoreCall[]) {
  const state: FixtureBehavior = { failFocus: false, failRefresh: false, delays: new Map() };
  const packagedCore = createPackagedCore(coreCalls);
  return {
    call: async (name: string, arguments_: Record<string, unknown>) => {
      const key = delayKey(name, arguments_);
      const delay = key ? state.delays.get(key) : undefined;
      if (key && delay) {
        state.delays.delete(key);
        await delay;
      }
      if (state.failRefresh && name === "code_status" && arguments_.action === "refresh") {
        state.failRefresh = false;
        return { schema_version: 1, code: "refresh_failed", message: "refresh_failed", retryable: true };
      }
      if (state.failFocus && name === "code_focus") {
        state.failFocus = false;
        return { schema_version: 1, code: "focus_failed", message: "focus_failed", retryable: true };
      }
      return packagedCore(name, arguments_);
    },
    failNextFocus: () => {
      state.failFocus = true;
    },
    failNextRefresh: () => {
      state.failRefresh = true;
    },
    holdNextLandmarks: () => holdNext(state, "landmarks"),
    holdNextFocus: (symbolId: string) => holdNext(state, `focus:${symbolId}`),
    holdNextRelation: (relation: string) => holdNext(state, `relation:${relation}`),
  };
}
