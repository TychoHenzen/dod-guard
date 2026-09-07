import assert from "node:assert/strict";
import { it } from "node:test";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
import {
  assertReplacementDocuments,
  Process,
  restartingSourceFixture,
  runtimeSourceOptions,
} from "../testing/runtime-lsp-test-support.js";

it("reopens one protected source document for a replacement process", async () => {
  const { backend, first, replacement, scheduler } = restartingSourceFixture();
  await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  first.kill();
  scheduler.run();
  await Promise.resolve();
  await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  assertReplacementDocuments(first, replacement);
});

it("confirms identity before publishing and disposes only after shutdown", async () => {
  const events: string[] = [];
  const process = new Process(events);
  const backend = createRuntimeLspBackend(
    runtimeSourceOptions(process, {
      dispose: () => events.push("dispose"),
    }),
  );
  await backend.start?.();
  await backend.shutdown?.();
  assert.deepEqual(events, ["exit", "dispose"]);
});
