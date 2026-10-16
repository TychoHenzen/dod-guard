import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

// The default $InvokeGit and $InvokeGhApi run through the shared native helper. The test body
// defines global git and gh functions that call standin.mjs through that same helper and re-emit
// its stderr as ErrorRecords, so the wrapper sees the stderr line as a real native stderr would
// be seen. Functions avoid cmd shims, which would consume the caret in HEAD^. standin.mjs keeps
// repository and protection state in state.json and writes a stderr line on every call.
// DOD_GUARD_MAINTENANCE_WRAPPER_OVERRIDE lets the same body run against another wrapper copy
// (for example the master version) to prove the test detects the old behavior.
const wrapperPath = process.env.DOD_GUARD_MAINTENANCE_WRAPPER_OVERRIDE || maintenanceWrapperPath;
const nativeHelperPath = fileURLToPath(new URL("./publish-native-command.ps1", import.meta.url));

const STANDIN_SOURCE = String.raw`import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(dir, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const [tool, ...args] = process.argv.slice(2);
const line = args.join(" ");
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const ok = (text) => { fs.writeSync(1, text); process.exit(0); };
const fail = (code, text) => { fs.writeSync(2, text + "\n"); process.exit(code); };
const head200 = "HTTP/2.0 200 OK\n\n";

fs.writeSync(2, "remote: Bypassed rule violations for refs/heads/master:\n");

if (tool === "git") {
  if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") ok("C:/repo/.git\n");
  if (line === "rev-parse HEAD") ok(state.head + "\n");
  if (line === "rev-parse HEAD^") ok(state.savedSha + "\n");
  if (line === "status --porcelain --untracked-files=no") ok("");
  if (args[0] === "push") {
    if (process.env.DOD_GUARD_FAIL_GIT_PUSH === "1") fail(5, "error: failed to push some refs");
    state.remote = state.head;
    save();
    ok("");
  }
  if (line === "ls-remote origin refs/heads/master") ok(state.remote + "\trefs/heads/master\n");
  fail(9, "unexpected git: " + line);
}

if (tool === "gh") {
  const [api, methodFlag, method, endpoint, include] = args;
  if (api !== "api" || methodFlag !== "--method" || include !== "--include" || args.length !== 5) {
    fail(9, "unexpected gh: " + line);
  }
  if (method === "GET" && endpoint === state.protectionEndpoint) {
    ok(head200 + JSON.stringify({
      url: "https://api.github.com/" + endpoint,
      allow_force_pushes: { enabled: true },
      enforce_admins: { enabled: state.adminEnabled },
      required_status_checks: { strict: true, contexts: ["build-test"] },
    }) + "\n");
  }
  if (method === "GET" && endpoint === state.adminEndpoint) {
    ok(head200 + JSON.stringify({ enabled: state.adminEnabled }) + "\n");
  }
  if (method === "DELETE" && endpoint === state.adminEndpoint) {
    state.adminEnabled = false;
    save();
    ok("HTTP/2.0 204 No Content\n\n");
  }
  if (method === "POST" && endpoint === state.adminEndpoint) {
    state.adminEnabled = true;
    save();
    ok(head200);
  }
  fail(9, "unexpected gh endpoint: " + line);
}

fail(9, "unknown tool: " + tool);
`;

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
$result = Invoke-MaintenancePublish -Owner 'TychoHenzen' -Repo 'dod-guard' -SavedSha '${savedSha}' -CommitAction $commitAction -PrePushAction $prePushAction
$result | ConvertTo-Json -Depth 20 -Compress
`;

function runNativePublish({ failGitPush = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dod-guard-maintenance-native-"));
  try {
    writeFileSync(join(dir, "standin.mjs"), STANDIN_SOURCE);
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
  assert.match(outcome.Error, /git push .* failed with exit code 5/);
});
