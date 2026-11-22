import assert from "node:assert/strict";
import { test } from "node:test";
import { realAdminEndpoint, runMaintenanceWrapper } from "./harness/maintenance-harness.mjs";

test("maintenance wrapper stops before any protection call when a pre-mutation gate fails", {
  skip: process.platform !== "win32",
}, () => {
  const failures = [
    ["commit", /commit failed/],
    ["native", /exit code 7/],
    ["pre-push", /pre-push failed/],
    ["head", /changed during pre-push validation/],
    ["parent", /changed during pre-push validation/],
    ["tracked-change", /tracked files differ from the release commit before push/],
  ];
  for (const [failureStage, pattern] of failures) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.equal(outcome.Result.Restored, false, failureStage);
    assert.equal(outcome.Result.DeleteAttempted, false, failureStage);
    assert.equal(outcome.Result.RestoreAttempts, 0, failureStage);
    assert.match(outcome.Result.Error, pattern, failureStage);
    assert.equal(
      outcome.Events.some((event) => /^(GET|DELETE|POST) /.test(event)),
      false,
      failureStage,
    );
  }
});

test("maintenance wrapper refuses a linked worktree before any protection call", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("linked-worktree");
  assert.equal(outcome.Result.Success, false);
  assert.match(outcome.Result.Error, /requires the primary checkout/);
  assert.equal(
    outcome.Events.some((event) => /^(GET|DELETE|POST) /.test(event)),
    false,
  );
});

// These readback failures were once covered only by a JS model of the script;
// they now run against maintenance-publish.ps1 itself.
test("maintenance wrapper stops before any mutation on an invalid initial readback", {
  skip: process.platform !== "win32",
}, () => {
  for (const failureStage of ["initial-read-500", "initial-admin-mismatch", "initial-missing-admin"]) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.match(outcome.Result.Error, /initial protection readback is invalid/, failureStage);
    assert.equal(
      outcome.Events.some((event) => /^(DELETE|POST) /.test(event)),
      false,
      failureStage,
    );
  }
});

test("maintenance wrapper stops before the push when the admin disable does not read back cleanly", {
  skip: process.platform !== "win32",
}, () => {
  for (const failureStage of ["admin-still-enabled", "disable-drift"]) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.match(outcome.Result.Error, /admin disable readback is invalid/, failureStage);
    assert.equal(
      outcome.Events.some((event) => event.startsWith("git push")),
      false,
      failureStage,
    );
    assert.ok(outcome.Events.includes(`POST ${realAdminEndpoint}`), failureStage);
  }
});

test("maintenance wrapper requires a boolean allow_force_pushes before any mutation", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("allow-force-string");
  assert.equal(outcome.Result.Success, false);
  assert.match(outcome.Result.Error, /allow_force_pushes\.enabled must be true/);
  assert.equal(
    outcome.Events.some((event) => /^(DELETE|POST) /.test(event)),
    false,
  );
});
