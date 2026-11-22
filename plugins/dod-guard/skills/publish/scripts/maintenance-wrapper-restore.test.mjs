import assert from "node:assert/strict";
import { test } from "node:test";
import { realAdminEndpoint, realProtectionEndpoint, runMaintenanceWrapper } from "./harness/maintenance-harness.mjs";

test("maintenance wrapper restores protection after push, remote readback, and admin disable failures", {
  skip: process.platform !== "win32",
}, () => {
  const failures = [
    ["push", /push failed/],
    ["ls-remote-mismatch", /does not equal release SHA/],
    ["admin-still-enabled", /admin disable readback is invalid/],
  ];
  for (const [failureStage, pattern] of failures) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.equal(outcome.Result.Restored, true, failureStage);
    assert.equal(outcome.Result.RestoreAttempts, 1, failureStage);
    assert.equal(outcome.Result.DeleteAttempted, true, failureStage);
    assert.match(outcome.Result.Error, pattern, failureStage);
    assert.ok(outcome.Events.includes(`POST ${realAdminEndpoint}`), failureStage);
  }
});

test("maintenance wrapper reads after a thrown admin disable before cleanup", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("delete");
  assert.equal(outcome.Result.Success, false);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 1);

  const deleteIndex = outcome.Events.indexOf(`DELETE ${realAdminEndpoint}`);
  const restoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`);
  assert.ok(deleteIndex >= 0);
  assert.ok(restoreIndex > deleteIndex);
  assert.deepEqual(
    outcome.Events.slice(deleteIndex + 1, restoreIndex).filter((event) => event.startsWith("GET ")),
    [`GET ${realProtectionEndpoint}`, `GET ${realAdminEndpoint}`],
  );
});

test("maintenance wrapper reads after a thrown restore before retrying", { skip: process.platform !== "win32" }, () => {
  const outcome = runMaintenanceWrapper("post");
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 2);
  assert.equal(outcome.Result.Error, null);

  const firstRestoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`);
  const secondRestoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`, firstRestoreIndex + 1);
  assert.ok(firstRestoreIndex >= 0);
  assert.ok(secondRestoreIndex > firstRestoreIndex);
  assert.deepEqual(
    outcome.Events.slice(firstRestoreIndex + 1, secondRestoreIndex).filter((event) => event.startsWith("GET ")),
    [`GET ${realProtectionEndpoint}`, `GET ${realAdminEndpoint}`],
  );
});

test("maintenance wrapper keeps the release error after a retried restore succeeds", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("push-post");
  assert.equal(outcome.Result.Success, false);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 2);
  assert.equal(outcome.Result.DeleteAttempted, true);
  assert.match(outcome.Result.Error, /push failed/);
});

test("maintenance wrapper reads admin state after a failed protection read and does not blindly retry", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("restore-protection-read");
  assert.equal(outcome.Result.Success, false);
  assert.equal(outcome.Result.Restored, false);
  assert.equal(outcome.Result.RestoreAttempts, 1);

  const firstRestoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`);
  assert.ok(firstRestoreIndex >= 0);
  assert.equal(outcome.Events.indexOf(`POST ${realAdminEndpoint}`, firstRestoreIndex + 1), -1);
  assert.deepEqual(
    outcome.Events.slice(firstRestoreIndex + 1).filter((event) => event.startsWith("GET ")),
    [`GET ${realProtectionEndpoint}`, `GET ${realAdminEndpoint}`],
  );
});
