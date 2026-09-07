import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { sourceSymbol } from "../support/source-symbol.js";
import { failingAdapter } from "./failing-adapter.js";
export function outsidePathAdapter(path: string): LanguageAdapter {
  const symbol = sourceSymbol({
    id: "outside",
    name: "helper",
    kind: "function",
    path,
    line: 0,
    endCharacter: 6,
  });
  return {
    ...failingAdapter("unused"),
    request: async () => ({
      operation: "search",
      revision: { generation: 1, manifest_sha256: "fixture" },
      symbols: [symbol],
    }),
  };
}
