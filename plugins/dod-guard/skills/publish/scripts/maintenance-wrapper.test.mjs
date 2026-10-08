import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maintenanceWrapperPath,
  parsePowerShellFile,
  realAdminEndpoint,
  realProtectionEndpoint,
  runMaintenanceWrapper,
  runPowerShell,
  savedSha,
} from "./maintenance-harness.mjs";

test("maintenance wrapper parses and owns the exact protected push boundary", {
  skip: process.platform !== "win32",
}, () => {
  const parse = parsePowerShellFile(maintenanceWrapperPath);
  assert.equal(parse.status, 0, `${parse.stdout}\n${parse.stderr}`);

  const outcome = runMaintenanceWrapper();
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 1);
  assert.ok(outcome.Events.includes("DELETE repos/TychoHenzen/dod-guard/branches/master/protection/enforce_admins"));
  assert.ok(outcome.Events.includes("POST repos/TychoHenzen/dod-guard/branches/master/protection/enforce_admins"));
  const lease = `--force-with-lease=refs/heads/master:${savedSha}`;
  assert.ok(outcome.Events.includes(`git push ${lease} origin HEAD:refs/heads/master`));
  assert.equal(
    outcome.Events.some((event) => event.includes("worktree")),
    false,
  );
});

test("maintenance wrapper parses gh reason phrases and preserves response bodies", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper("", true);
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.RestoreAttempts, 1);
});

test("maintenance wrapper restores protection after commit, pre-push, and push failures", {
  skip: process.platform !== "win32",
}, () => {
  for (const failureStage of ["commit", "pre-push", "push"]) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.equal(outcome.Result.Restored, true, failureStage);
    assert.equal(outcome.Result.RestoreAttempts, 1, failureStage);
    assert.ok(
      outcome.Events.includes("POST repos/TychoHenzen/dod-guard/branches/master/protection/enforce_admins"),
      failureStage,
    );
  }
});

test("maintenance wrapper checks native action status and post-hook Git identity", {
  skip: process.platform !== "win32",
}, () => {
  for (const failureStage of ["native", "head", "parent"]) {
    const outcome = runMaintenanceWrapper(failureStage);
    assert.equal(outcome.Result.Success, false, failureStage);
    assert.equal(outcome.Result.Restored, true, failureStage);
    assert.match(
      outcome.Result.Error,
      failureStage === "native" ? /exit code 7/ : /changed during pre-push validation/,
      failureStage,
    );
  }
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

  const firstRestoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`);
  const secondRestoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`, firstRestoreIndex + 1);
  assert.ok(firstRestoreIndex >= 0);
  assert.ok(secondRestoreIndex > firstRestoreIndex);
  assert.deepEqual(
    outcome.Events.slice(firstRestoreIndex + 1, secondRestoreIndex).filter((event) => event.startsWith("GET ")),
    [`GET ${realProtectionEndpoint}`, `GET ${realAdminEndpoint}`],
  );
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
