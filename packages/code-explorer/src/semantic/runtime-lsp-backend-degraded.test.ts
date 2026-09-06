import assert from "node:assert/strict";
import { it } from "node:test";
import {
  degradedCapabilities,
  degradedProcess,
  runtimeEntrySymbol,
  runtimeOptions,
} from "../testing/runtime-lsp-test-support.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";

it("publishes a relation-level degraded status from the runtim", async () => {
  const process = degradedProcess();
  const backend = createRuntimeLspBackend(
    runtimeOptions(process, {
      symbols: new Map([["entry", runtimeEntrySymbol()]]),
    }),
  );
  await assert.rejects(
    backend.query({
      operation: "definition",
      symbol_id: "entry",
    }),
    /invalid_backend_result/,
  );
  assert.deepEqual(backend.readiness(), {
    state: "degraded",
  });
  assert.deepEqual(backend.capabilities?.(), degradedCapabilities);
  const references = await backend.query({
    operation: "references",
    symbol_id: "entry",
  });
  assert.equal(references.operation, "references");
});
