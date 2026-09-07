import { deferred } from "../fixtures/deferred.test.js";
import type { FixtureBehavior } from "./behavior-state.test.js";

function delayKey(name: string, args: Record<string, unknown>) {
  if (name === "code_search")
    return args.query === "" ? "landmarks" : undefined;
  if (name === "code_focus") return prefixed("focus", args.symbol_id);
  if (name === "code_follow") return prefixed("relation", args.relation);
}

function prefixed(prefix: string, value: unknown): string | undefined {
  if (typeof value === "string") return `${prefix}:${value}`;
}

export function holdNext(state: FixtureBehavior, key: string): () => void {
  const held = deferred<void>();
  state.delays.set(key, held.promise);
  return held.resolve;
}

export async function waitForHeldReply(
  state: FixtureBehavior,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  const key = delayKey(name, args);
  if (!key) return;
  const delay = state.delays.get(key);
  if (!delay) return;
  state.delays.delete(key);
  await delay;
}
