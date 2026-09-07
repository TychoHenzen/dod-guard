import assert from "node:assert/strict";
import { it } from "node:test";
import { DirectLspRuntimeTelemetry } from "../semantic/direct-lsp/direct-lsp-runtime-telemetry.js";

it("bounds retained restart delay telemetry", () => {
  const telemetry = new DirectLspRuntimeTelemetry();
  for (let delay = 0; delay < 300; delay += 1) telemetry.recordRestartDelay(delay);
  assert.equal(telemetry.restartDelaysSnapshot().length, 256);
  assert.deepEqual(telemetry.restartDelaysSnapshot().slice(-2), [298, 299]);
});
