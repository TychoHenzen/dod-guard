import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../support/adapter-status.js";

export function failingAdapter(message: string): LanguageAdapter {
  return {
    status: () => readyAdapterStatus({ name: "fixture", version: "1.0.0" }),
    request: async () => {
      throw new Error(message);
    },
  };
}
