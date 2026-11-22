import assert from "node:assert/strict";
import { test } from "node:test";
import { maintenanceWrapperPath, runMaintenanceWrapper, runPowerShell } from "./harness/maintenance-harness.mjs";

test("maintenance wrapper parses gh reason phrases and preserves response bodies", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("", true);
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 1);
});

test("maintenance wrapper rejects malformed protected responses with evidence", {
  skip: process.platform !== "win32",
}, () => {
  const deleteBody = runMaintenanceWrapper("delete-body");
  assert.equal(deleteBody.Result.Success, false);
  assert.equal(deleteBody.Result.Restored, true);

  const malformed = runMaintenanceWrapper("malformed-restore");
  assert.equal(malformed.Result.Success, false);
  assert.equal(malformed.Result.Restored, false);
  assert.match(malformed.Result.Error, /protection snapshot/);
  assert.match(malformed.Result.Error, /broken/);

  const mismatch = runMaintenanceWrapper("restore-mismatch");
  assert.equal(mismatch.Result.Success, false);
  assert.equal(mismatch.Result.Restored, false);
  assert.match(mismatch.Result.Error, /allow_force_pushes/);
});

test("maintenance wrapper preserves an initially disabled admin state", { skip: process.platform !== "win32" }, () => {
  const outcome = runMaintenanceWrapper("initial-disabled");
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 0);
  assert.equal(outcome.Result.DeleteAttempted, false);
  assert.equal(
    outcome.Events.some((event) => event.startsWith("DELETE ") || event.startsWith("POST ")),
    false,
  );
});

test("maintenance wrapper does not leak strict mode when dot-sourced", { skip: process.platform !== "win32" }, () => {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    ". $env:DOD_GUARD_MAINTENANCE_WRAPPER",
    "$undefinedMaintenanceVariable",
    "Write-Output 'ok'",
  ].join("; ");
  const result = runPowerShell(command, { DOD_GUARD_MAINTENANCE_WRAPPER: maintenanceWrapperPath });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /ok/);
});
