import assert from "node:assert/strict";
import { it } from "node:test";
import { createDirectLspClient } from "../semantic/direct-lsp/direct-lsp.js";
import { assertPythonConfiguration, FakeProcess, ready, Scheduler } from "../testing/direct-lsp-test-support.js";

it("retains initialize capabilities and answers only safe Python configuration", async () => {
  const process = new FakeProcess();
  const client = createDirectLspClient({
    language: "python",
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
  });
  const start = client.start(process);
  const initialize = process.sent[0] as { id: number };
  process.respond({
    jsonrpc: "2.0",
    id: initialize.id,
    result: { capabilities: { definitionProvider: true } },
  });
  await start;
  assert.deepEqual(client.status().server_capabilities, {
    definitionProvider: true,
  });
  assertPythonConfiguration(process);
});

it("snapshots client capabilities and safe initialization options", async () => {
  const process = new FakeProcess();
  const capabilities = {
    workspace: { configuration: true },
  };
  const safe = { cargo: { buildScripts: false } };
  const client = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities,
    safe_initialization_options: safe,
    scheduler: new Scheduler(),
  });
  capabilities.workspace.configuration = false;
  safe.cargo.buildScripts = true;
  const start = client.start(process);
  process.respond({
    jsonrpc: "2.0",
    id: 1,
    result: { capabilities: {} },
  });
  await start;
  assert.deepEqual(process.sent[0].params, {
    processId: null,
    rootUri: "file:///frozen",
    capabilities: { workspace: { configuration: true } },
    initializationOptions: {
      cargo: { buildScripts: false },
    },
  });
});
