import type { LanguageAdapter } from "../../../semantic/api/public-api.js";
import { readyAdapterStatus } from "../../navigation/support/adapter-status.js";
import { sourceSymbol } from "../../navigation/support/source-symbol.js";
export function adapter(
  refresh: () => Promise<void>,
  name: () => string,
): LanguageAdapter {
  return {
    status: () => readyAdapterStatus({ name: "fixture", version: "1" }),
    refresh,
    request: async () => ({
      operation: "search",
      revision: { generation: 1, manifest_sha256: "fixture" },
      symbols: [namedSymbol(name)],
    }),
  };
}
function namedSymbol(name: () => string) {
  return sourceSymbol({
    id: name(),
    name: name(),
    kind: "function",
    path: "src/lib.rs",
    line: 0,
    endCharacter: 1,
  });
}
