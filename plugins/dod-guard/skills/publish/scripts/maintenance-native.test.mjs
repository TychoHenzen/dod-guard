import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  maintenanceWrapperPath,
  realAdminEndpoint,
  realProtectionEndpoint,
  releaseSha,
  runPowerShell,
  savedSha,
} from "./maintenance-harness.mjs";

// Global git and gh functions stand in for the real tools (cmd shims would eat the caret in
// HEAD^) and re-emit the stand-in's stderr as ErrorRecords, as a real native stderr arrives.
// DOD_GUARD_MAINTENANCE_WRAPPER_OVERRIDE runs the same body against another wrapper copy, such
// as master's, to prove the test detects the old behavior.
const wrapperPath = process.env.DOD_GUARD_MAINTENANCE_WRAPPER_OVERRIDE || maintenanceWrapperPath;
const nativeHelperPath = fileURLToPath(new URL("./publish-native-command.ps1", import.meta.url));

const standinSourcePath = fileURLToPath(new URL("./maintenance-native-standin.mjs", import.meta.url));

// Test-owned PowerShell body: the real default invokers run through the shared helper, and only
// the commit and pre-push actions are supplied. The last stdout line is the compact result JSON.
const NATIVE_PUBLISH = String.raw`
$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_NATIVE_HELPER
. $env:DOD_GUARD_MAINTENANCE_WRAPPER
$statePath = Join-Path $env:DOD_GUARD_NATIVE_DIR 'state.json'
$standin = Join-Path $env:DOD_GUARD_NATIVE_DIR 'standin.mjs'
$node = '${process.execPath}'
function global:Invoke-StandinCommand([string]$Tool, [string[]]$Arguments) {
  $native = Invoke-PublishNativeCommand $node (@($standin, $Tool) + $Arguments) $null
  if ($native.Stderr -ne '') { Write-Error $native.Stderr }
  $global:LASTEXITCODE = $native.ExitCode
  $native.Output
}
function global:git { Invoke-StandinCommand 'git' $args }
function global:gh { Invoke-StandinCommand 'gh' $args }
$commitAction = {
  $state = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
  $state.head = '${releaseSha}'
  [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Compress))
}
$prePushAction = {}
$publishArguments = @{
  Owner = 'TychoHenzen'
  Repo = 'dod-guard'
  SavedSha = '${savedSha}'
  CommitAction = $commitAction
  PrePushAction = $prePushAction
}
$result = Invoke-MaintenancePublish @publishArguments
$result | ConvertTo-Json -Depth 20 -Compress
`;

function runNativePublish({ failGitPush = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dod-guard-maintenance-native-"));
  try {
    copyFileSync(standinSourcePath, join(dir, "standin.mjs"));
    writeFileSync(
      join(dir, "state.json"),
      JSON.stringify({
        head: savedSha,
        remote: savedSha,
        savedSha,
        adminEnabled: true,
        protectionEndpoint: realProtectionEndpoint,
        adminEndpoint: realAdminEndpoint,
      }),
    );

    const result = runPowerShell(NATIVE_PUBLISH, {
      DOD_GUARD_MAINTENANCE_WRAPPER: wrapperPath,
      DOD_GUARD_NATIVE_HELPER: nativeHelperPath,
      DOD_GUARD_NATIVE_DIR: dir,
      DOD_GUARD_FAIL_GIT_PUSH: failGitPush ? "1" : "",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/);
    return JSON.parse(lines.at(-1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("native publish completes through the real git and gh default invokers", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runNativePublish();
  assert.equal(outcome.Success, true, outcome.Error);
  assert.equal(outcome.ReleaseSha, releaseSha);
  assert.equal(outcome.Restored, true);
  assert.equal(outcome.Error, null);
  // Success and Restored already prove no stderr line reached a parsed HTTP body (it would
  // fail JSON parsing or the saved-protection comparison); the stand-in writes it on every call.
  assert.doesNotMatch(outcome.ReleaseSha, /Bypassed|remote:/);
  assert.doesNotMatch(JSON.stringify(outcome), /Bypassed rule violations/);
});

test("native publish keeps protection restored when the real git push fails", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runNativePublish({ failGitPush: true });
  assert.equal(outcome.Success, false);
  assert.equal(outcome.Stage, "restore");
  assert.equal(outcome.DeleteAttempted, true);
  assert.equal(outcome.Restored, true);
  assert.equal(outcome.RestoreAttempts, 1);
  assert.match(outcome.Error, /git push .* failed with exit code 5: .*failed to push some refs/s);
});
