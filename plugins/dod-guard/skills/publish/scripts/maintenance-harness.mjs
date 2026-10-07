import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// PowerShell harness for maintenance-publish.ps1. Each stub chunk stands in for one
// external command; DOD_GUARD_FAILURE_STAGE picks the failure a test simulates.
export const maintenanceWrapperPath = fileURLToPath(new URL("./maintenance-publish.ps1", import.meta.url));
export const realProtectionEndpoint = "repos/TychoHenzen/dod-guard/branches/master/protection";
export const realAdminEndpoint = `${realProtectionEndpoint}/enforce_admins`;

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

const MAINTENANCE_1 = `
$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_MAINTENANCE_WRAPPER
$savedSha = '0123456789abcdef0123456789abcdef01234567'
$protectionEndpoint = 'repos/TychoHenzen/dod-guard/branches/master/protection'
$adminEndpoint = $protectionEndpoint + '/enforce_admins'
$events = New-Object System.Collections.ArrayList
$fixtureProtection = [pscustomobject]@{
  url = 'https://api.github.com/repos/{owner}/{repo}/branches/master/protection'
  allow_force_pushes = [pscustomobject]@{ enabled = $true }
  enforce_admins = [pscustomobject]@{ enabled = $true }
  required_status_checks = [pscustomobject]@{ strict = $true; contexts = @('build-test') }
}
$state = @{ ProtectionReads = 0; AdminReads = 0; RestoreCalls = 0; GhCalls = 0; HeadSha = $savedSha; ParentSha = $savedSha; ReleaseSha = 'fedcba9876543210fedcba9876543210fedcba98' }
`;

const MAINTENANCE_2 = `$invokeGit = {
  param([string[]]$Arguments)
  [void]$events.Add(('git ' + ($Arguments -join ' ')))
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq '--path-format=absolute') { return 'C:\repo\.git' }
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD') { return $state.HeadSha }
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD^') {
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'commit') { throw 'commit failed' }
    return $state.ParentSha
  }
  if ($Arguments[0] -eq 'push' -and $env:DOD_GUARD_FAILURE_STAGE -eq 'push') { throw 'push failed' }
  if ($Arguments[0] -eq 'push') { return '' }
  throw ('unexpected git command: ' + ($Arguments -join ' '))
}
`;

const MAINTENANCE_3 = `$invokeGhApi = {
  param([string]$Method, [string]$Endpoint)
  [void]$events.Add(($Method + ' ' + $Endpoint))
  if ($Method -eq 'DELETE') {
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'delete') { throw 'delete failed' }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'delete-body') { return [pscustomobject]@{ Status = 204; Body = [pscustomobject]@{ unexpected = $true } } }
    return [pscustomobject]@{ Status = 204; Body = $null }
  }
  if ($Method -eq 'POST') {
    $state.RestoreCalls++
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'post' -and $state.RestoreCalls -eq 1) { throw 'post failed' }
    return [pscustomobject]@{ Status = 200; Body = $null }
  }
  if ($Endpoint -like '*/protection') {
    $state.ProtectionReads++
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'initial-read-500' -and $state.ProtectionReads -eq 1) { return [pscustomobject]@{ Status = 500; Body = $fixtureProtection } }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'initial-missing-admin' -and $state.ProtectionReads -eq 1) {
      return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ url = $fixtureProtection.url; allow_force_pushes = [pscustomobject]@{ enabled = $true } } }
    }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'disable-drift' -and $state.RestoreCalls -eq 0 -and $state.ProtectionReads -eq 2) {
      $driftedProtection = $fixtureProtection | ConvertTo-Json -Depth 20 | ConvertFrom-Json
      $driftedProtection.enforce_admins.enabled = $false
      $driftedProtection.required_status_checks.strict = $false
      return [pscustomobject]@{ Status = 200; Body = $driftedProtection }
    }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'restore-protection-read' -and $state.RestoreCalls -eq 1 -and $state.ProtectionReads -eq 3) { throw 'restore protection read failed' }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'malformed-restore' -and $state.RestoreCalls -ge 1) { return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ broken = $true } } }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'restore-mismatch' -and $state.RestoreCalls -ge 1) {
      $mismatchedProtection = $fixtureProtection | ConvertTo-Json -Depth 20 | ConvertFrom-Json
      $mismatchedProtection.allow_force_pushes.enabled = $false
      return [pscustomobject]@{ Status = 200; Body = $mismatchedProtection }
    }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'allow-force-string' -and $state.ProtectionReads -eq 1) {
      $invalidProtection = $fixtureProtection | ConvertTo-Json -Depth 20 | ConvertFrom-Json
      $invalidProtection.allow_force_pushes.enabled = 'true'
      return [pscustomobject]@{ Status = 200; Body = $invalidProtection }
    }
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'initial-disabled' -and $state.ProtectionReads -eq 1) {
      $disabledProtection = $fixtureProtection | ConvertTo-Json -Depth 20 | ConvertFrom-Json
      $disabledProtection.enforce_admins.enabled = $false
      return [pscustomobject]@{ Status = 200; Body = $disabledProtection }
    }
    if ($state.RestoreCalls -eq 0 -and $state.ProtectionReads -gt 1) {
      return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ url = $fixtureProtection.url; allow_force_pushes = [pscustomobject]@{ enabled = $true }; enforce_admins = [pscustomobject]@{ enabled = $false }; required_status_checks = $fixtureProtection.required_status_checks } }
    }
    [void]$events.Add(('protection-body=' + ($fixtureProtection | ConvertTo-Json -Compress)))
    return [pscustomobject]@{ Status = 200; Body = $fixtureProtection }
  }
  $state.AdminReads++
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'initial-admin-mismatch' -and $state.AdminReads -eq 1) { return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $false } } }
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'admin-still-enabled' -and $state.RestoreCalls -eq 0 -and $state.AdminReads -eq 2) { return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $true } } }
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'initial-disabled' -and $state.AdminReads -eq 1) { return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $false } } }
  if ($state.RestoreCalls -eq 0 -and $state.AdminReads -gt 1) {
    return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $false } }
  }
  [void]$events.Add('admin-body-enabled=' + ([string]$true))
  return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $true } }
}
`;

const MAINTENANCE_4 = `if ($env:DOD_GUARD_USE_DEFAULT_GH -eq 'true') {
  function global:gh {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    if ($Arguments -contains '--silent') { throw 'gh body was suppressed' }
    $global:LASTEXITCODE = 0
    $state.GhCalls = [int]$state.GhCalls + 1
    $expectedMethod = 'GET'
    $expectedEndpoint = $protectionEndpoint
    if ($state.GhCalls -eq 3) {
      $expectedMethod = 'DELETE'
      $expectedEndpoint = $adminEndpoint
    } elseif ($state.GhCalls -ge 6 -and (($state.GhCalls - 6) % 3 -eq 0)) {
      $expectedMethod = 'POST'
      $expectedEndpoint = $adminEndpoint
    } elseif (($state.GhCalls - 2) % 3 -eq 0) {
      $expectedEndpoint = $adminEndpoint
    } elseif (($state.GhCalls - 1) % 3 -ne 0) {
      throw ('unexpected gh call ' + $state.GhCalls)
    }
    if ($Arguments.Count -ne 5 -or $Arguments[0] -ne 'api' -or $Arguments[1] -ne '--method' -or $Arguments[2] -ne $expectedMethod -or $Arguments[3] -ne $expectedEndpoint -or $Arguments[4] -ne '--include') {
      throw ('unexpected gh arguments: ' + ($Arguments -join ' '))
    }
    if (($state.GhCalls - 1) % 3 -eq 0) {
      $enabled = $state.GhCalls -ne 4
      $body = [pscustomobject]@{
        url = $fixtureProtection.url
        allow_force_pushes = [pscustomobject]@{ enabled = $true }
        enforce_admins = [pscustomobject]@{ enabled = $enabled }
        required_status_checks = $fixtureProtection.required_status_checks
      } | ConvertTo-Json -Compress
      Write-Output 'HTTP/2.0 200 OK'
      Write-Output 'Content-Type: application/json'
      Write-Output ''
      Write-Output $body
      return
    }
    if (($state.GhCalls - 2) % 3 -eq 0) {
      $enabled = $state.GhCalls -ne 5
      Write-Output 'HTTP/2.0 200 OK'
      Write-Output 'Content-Type: application/json'
      Write-Output ''
      Write-Output (([pscustomobject]@{ enabled = $enabled }) | ConvertTo-Json -Compress)
      return
    }
    if ($state.GhCalls -eq 3) {
      Write-Output 'HTTP/2.0 204 No Content'
      Write-Output ''
      return
    }
    if ($state.GhCalls -ge 6 -and (($state.GhCalls - 6) % 3 -eq 0)) {
      Write-Output 'HTTP/2.0 200 OK'
      Write-Output ''
      return
    }
    throw ('unexpected gh call ' + $state.GhCalls)
  }
  $invokeGhApi = $null
}
`;

const MAINTENANCE_5 = `$commitAction = {
  [void]$events.Add('commit')
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'commit') { throw 'commit failed' }
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'native') { cmd.exe /c exit 7 }
  $state.HeadSha = $state.ReleaseSha
  $state.ParentSha = $savedSha
}
$prePushAction = {
  [void]$events.Add('pre-push')
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'pre-push') { throw 'pre-push failed' }
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'head') { $state.HeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'parent') { $state.ParentSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
}
$result = Invoke-MaintenancePublish -Owner 'TychoHenzen' -Repo 'dod-guard' -SavedSha $savedSha -CommitAction $commitAction -PrePushAction $prePushAction -InvokeGit $invokeGit -InvokeGhApi $invokeGhApi
[pscustomobject]@{ Result = $result; Events = @($events) } | ConvertTo-Json -Depth 20 -Compress
`;

function maintenanceWrapperHarness() {
  return [MAINTENANCE_1, MAINTENANCE_2, MAINTENANCE_3, MAINTENANCE_4, MAINTENANCE_5].join("");
}

export function runMaintenanceWrapper(failureStage = "", useDefaultGhApi = false) {
  const result = runPowerShell(maintenanceWrapperHarness(failureStage), {
    DOD_GUARD_MAINTENANCE_WRAPPER: maintenanceWrapperPath,
    DOD_GUARD_FAILURE_STAGE: failureStage,
    DOD_GUARD_USE_DEFAULT_GH: String(useDefaultGhApi),
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}
