import assert from "node:assert/strict";
import { it } from "node:test";
import { createBackendStatusReport } from "./backend-status.js";
import { createNativeProjectRoot } from "./project-root.js";
import { createRuntimeAdapters } from "./runtime-bootstrap.js";

it("exposes one fail-closed status for every selected production lan", () => {
  const statuses = createBackendStatusReport(
    createRuntimeAdapters(createNativeProjectRoot(process.cwd())),
  ).backends;
  assert.deepEqual(
    statuses.map((status) => status.language),
    ["rust", "python", "csharp"],
  );
  const csharp = statuses.find((status) => status.language === "csharp");
  assert.ok(
    csharp?.state === "initializing" || csharp?.state === "unavailable",
  );
  if (csharp?.state === "unavailable")
    assert.equal(csharp.failure_code, "backend_unavailable");
});
