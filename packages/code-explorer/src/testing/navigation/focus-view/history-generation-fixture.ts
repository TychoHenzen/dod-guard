import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { createServer } from "../../../index.js";
import { focusAdapter } from "./focus-adapter.js";

export function historyGenerationFixture() {
  const manifests = [
    new Map([["src/lib.rs", "one"]]),
    new Map([["src/lib.rs", "two"]]),
  ];
  const freshness = new WorkspaceFreshness({
    reconcile: async () => ({ manifest: manifests.shift() ?? new Map() }),
  });
  const server = createServer({
    adapters: [
      focusAdapter({
        body: "TypeName",
        visible_symbols: [{ name: "TypeName", symbol_id: "type-id" }],
      }),
    ],
    freshness,
  });
  return { freshness, server };
}
