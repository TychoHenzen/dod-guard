import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DEFAULT_GH, GH_RESPONSE } from "./maintenance-stubs-gh.mjs";
import { READ_ADMIN, READ_PROTECTION } from "./maintenance-stubs-protection.mjs";
import { INVOKE_GH_API, INVOKE_GIT, PUBLISH_CALL } from "./maintenance-stubs-runner.mjs";

// PowerShell harness for maintenance-publish.ps1. Each stub chunk stands in for one
// external command; DOD_GUARD_FAILURE_STAGE picks the failure a test simulates.
// The chunks are String.raw so Windows paths reach PowerShell with their backslashes.
export const maintenanceWrapperPath = fileURLToPath(new URL("../maintenance-publish.ps1", import.meta.url));
export const realProtectionEndpoint = "repos/TychoHenzen/dod-guard/branches/master/protection";
export const realAdminEndpoint = `${realProtectionEndpoint}/enforce_admins`;
export const savedSha = "0123456789abcdef0123456789abcdef01234567";
export const releaseSha = "fedcba9876543210fedcba9876543210fedcba98";

export function runPowerShell(command, environment = {}) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      env: { ...process.env, ...environment },
      windowsHide: true,
    },
  );
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

const PARSE_FILE = String.raw`
$tokens = $null
$errors = $null
$parser = [System.Management.Automation.Language.Parser]
$parser::ParseFile($env:DOD_GUARD_PARSE_TARGET, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }
`;

export function parsePowerShellFile(path) {
  return runPowerShell(PARSE_FILE, { DOD_GUARD_PARSE_TARGET: path });
}

const MAINTENANCE_1 = String.raw`
$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_MAINTENANCE_WRAPPER
$fixtureStage = $env:DOD_GUARD_FAILURE_STAGE
$savedSha = '${savedSha}'
$protectionEndpoint = 'repos/TychoHenzen/dod-guard/branches/master/protection'
$adminEndpoint = $protectionEndpoint + '/enforce_admins'
$events = New-Object System.Collections.ArrayList
$fixtureProtection = [pscustomobject]@{
  url = 'https://api.github.com/repos/{owner}/{repo}/branches/master/protection'
  allow_force_pushes = [pscustomobject]@{ enabled = $true }
  enforce_admins = [pscustomobject]@{ enabled = $true }
  required_status_checks = [pscustomobject]@{ strict = $true; contexts = @('build-test') }
}
$state = @{
  ProtectionReads = 0
  AdminReads = 0
  RestoreCalls = 0
  GhCalls = 0
  HeadSha = $savedSha
  ParentSha = $savedSha
  RemoteSha = $savedSha
  ReleaseSha = '${releaseSha}'
}
`;

const MAINTENANCE_CHUNKS = [
  MAINTENANCE_1,
  INVOKE_GIT,
  INVOKE_GH_API,
  READ_PROTECTION,
  READ_ADMIN,
  DEFAULT_GH,
  GH_RESPONSE,
  PUBLISH_CALL,
];

export function runMaintenanceWrapper(failureStage = "", useDefaultGhApi = false) {
  const result = runPowerShell(MAINTENANCE_CHUNKS.join(""), {
    DOD_GUARD_MAINTENANCE_WRAPPER: maintenanceWrapperPath,
    DOD_GUARD_FAILURE_STAGE: failureStage,
    DOD_GUARD_USE_DEFAULT_GH: String(useDefaultGhApi),
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}
