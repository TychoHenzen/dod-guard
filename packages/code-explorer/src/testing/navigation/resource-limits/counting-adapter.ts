import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../support/adapter-status.js";

export function countingAdapter(
  onRequest: () => void,
  pending?: Promise<never>,
): LanguageAdapter {
  return {
    status: () => readyAdapterStatus({ name: "fixture", version: "1" }),
    request: async () => {
      onRequest();
      if (pending) return pending;
      throw new Error("unexpected backend request");
    },
  };
}
