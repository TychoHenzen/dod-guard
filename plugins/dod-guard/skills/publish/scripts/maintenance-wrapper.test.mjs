import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maintenanceWrapperPath,
  parsePowerShellFile,
  realAdminEndpoint,
  realProtectionEndpoint,
  releaseSha,
  runMaintenanceWrapper,
  savedSha,
} from "./harness/maintenance-harness.mjs";

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

test("maintenance wrapper disables admin enforcement only after release validation", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper();
  assert.equal(outcome.Result.Success, true);
  assert.equal(outcome.Result.Restored, true);
  assert.equal(outcome.Result.DeleteAttempted, true);
  assert.equal(outcome.Result.ReleaseSha, releaseSha);

  const lease = `--force-with-lease=refs/heads/master:${savedSha}`;
  const ordered = [
    "commit",
    "pre-push",
    "git rev-parse HEAD",
    "git rev-parse HEAD^",
    "git status --porcelain --untracked-files=no",
    `GET ${realProtectionEndpoint}`,
    `GET ${realAdminEndpoint}`,
    `DELETE ${realAdminEndpoint}`,
    `git push ${lease} origin HEAD:refs/heads/master`,
    "git ls-remote origin refs/heads/master",
    `POST ${realAdminEndpoint}`,
  ];
  let previous = -1;
  for (const event of ordered) {
    const index = outcome.Events.indexOf(event, previous + 1);
    assert.ok(index >= 0, event);
    assert.ok(index > previous, event);
    previous = index;
  }
});

test("maintenance wrapper keeps the admin-off window to disable readback, push, and remote readback", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runMaintenanceWrapper();
  const deleteIndex = outcome.Events.indexOf(`DELETE ${realAdminEndpoint}`);
  const restoreIndex = outcome.Events.indexOf(`POST ${realAdminEndpoint}`);
  assert.ok(deleteIndex >= 0);
  assert.ok(restoreIndex > deleteIndex);
  const lease = `--force-with-lease=refs/heads/master:${savedSha}`;
  assert.deepEqual(outcome.Events.slice(deleteIndex + 1, restoreIndex), [
    `GET ${realProtectionEndpoint}`,
    `GET ${realAdminEndpoint}`,
    `git push ${lease} origin HEAD:refs/heads/master`,
    "git ls-remote origin refs/heads/master",
  ]);
});
