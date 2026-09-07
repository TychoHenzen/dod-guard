import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../support/adapter-status.js";
import { symbol } from "./symbol.js";

export function focusAdapter(
  content:
    | { body: string; visible_symbols: { name: string; symbol_id: string }[] }
    | undefined,
): LanguageAdapter {
  return {
    status: () => readyAdapterStatus({ name: "test", version: "test" }),
    request: async () => ({
      operation: "focus",
      revision: { generation: 7, manifest_sha256: "fixture" },
      symbol,
      ...(content ? { content } : {}),
    }),
  };
}
