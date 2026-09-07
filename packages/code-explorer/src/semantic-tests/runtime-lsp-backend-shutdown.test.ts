import assert from "node:assert/strict";
import { it } from "node:test";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
import { Process, runtimeOptions, Scheduler } from "../testing/runtime-lsp-test-support.js";

it("force-kills an ignored shutdown before disposing once", async () => {
  const events: string[] = [];
  const process = new Process(events);
  process.ignoreShutdown = true;
  process.ignoreExit = true;
  const scheduler = new Scheduler();
  const backend = createRuntimeLspBackend(
    runtimeOptions(process, {
      scheduler,
      dispose: () => events.push("dispose"),
    }),
  );
  await backend.start?.();
  const shutdown = backend.shutdown?.();
  scheduler.run();
  await Promise.resolve();
  scheduler.run();
  await shutdown;
  assert.deepEqual(events, ["kill", "dispose"]);
});

it("settles a child error without double disposal", async () => {
  const events: string[] = [];
  const process = new Process(events);
  const backend = createRuntimeLspBackend(
    runtimeOptions(process, {
      dispose: () => events.push("dispose"),
    }),
  );
  await backend.start?.();
  process.error();
  await backend.shutdown?.();
  await backend.shutdown?.();
  assert.deepEqual(events, ["kill", "dispose"]);
});
