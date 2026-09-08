import assert from "node:assert/strict";
import { it } from "node:test";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
import {
  degradedCapabilities,
  degradedProcess,
  runtimeEntrySymbol,
  runtimeOptions,
} from "../testing/runtime/runtime-lsp-test-support.js";

it("publishes a degraded relation status from the runtime backend", async () => {
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
