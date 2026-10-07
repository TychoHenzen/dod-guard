import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// PowerShell harness for maintenance-publish.ps1. Each stub chunk stands in for one
// external command; DOD_GUARD_FAILURE_STAGE picks the failure a test simulates.
// The chunks are String.raw so Windows paths reach PowerShell with their backslashes.
export const maintenanceWrapperPath = fileURLToPath(new URL("./maintenance-publish.ps1", import.meta.url));
export const realProtectionEndpoint = "repos/TychoHenzen/dod-guard/branches/master/protection";
export const realAdminEndpoint = `${realProtectionEndpoint}/enforce_admins`;
export const savedSha = "0123456789abcdef0123456789abcdef01234567";

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
  ReleaseSha = 'fedcba9876543210fedcba9876543210fedcba98'
}
`;

const MAINTENANCE_2 = String.raw`$invokeGit = {
  param([string[]]$Arguments)
  [void]$events.Add(('git ' + ($Arguments -join ' ')))
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq '--path-format=absolute') {
    if ($fixtureStage -eq 'linked-worktree' -and $Arguments[2] -eq '--git-dir') {
      return 'C:\repo\.git\worktrees\release'
    }
    return 'C:\repo\.git'
  }
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD') { return $state.HeadSha }
  if ($Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD^') {
    if ($fixtureStage -eq 'commit') { throw 'commit failed' }
    return $state.ParentSha
  }
  if ($Arguments[0] -eq 'push' -and $fixtureStage -eq 'push') { throw 'push failed' }
  if ($Arguments[0] -eq 'push') { return '' }
  throw ('unexpected git command: ' + ($Arguments -join ' '))
}
`;

const MAINTENANCE_3 = String.raw`function Copy-FixtureProtection {
  $fixtureProtection | ConvertTo-Json -Depth 20 | ConvertFrom-Json
}
$invokeGhApi = {
  param([string]$Method, [string]$Endpoint)
  [void]$events.Add(($Method + ' ' + $Endpoint))
  if ($Method -eq 'DELETE') {
    if ($fixtureStage -eq 'delete') { throw 'delete failed' }
    if ($fixtureStage -eq 'delete-body') {
      return [pscustomobject]@{ Status = 204; Body = [pscustomobject]@{ unexpected = $true } }
    }
    return [pscustomobject]@{ Status = 204; Body = $null }
  }
  if ($Method -eq 'POST') {
    $state.RestoreCalls++
    if ($fixtureStage -eq 'post' -and $state.RestoreCalls -eq 1) { throw 'post failed' }
    return [pscustomobject]@{ Status = 200; Body = $null }
  }
  if ($Endpoint -like '*/protection') { return (& $readProtection) }
  return (& $readAdmin)
}
`;

const MAINTENANCE_4 = String.raw`$readProtection = {
  $state.ProtectionReads++
  $first = $state.ProtectionReads -eq 1
  $restored = $state.RestoreCalls -ge 1
  if ($fixtureStage -eq 'initial-read-500' -and $first) {
    return [pscustomobject]@{ Status = 500; Body = $fixtureProtection }
  }
  if ($fixtureStage -eq 'initial-missing-admin' -and $first) {
    $partial = [pscustomobject]@{
      url = $fixtureProtection.url
      allow_force_pushes = [pscustomobject]@{ enabled = $true }
    }
    return [pscustomobject]@{ Status = 200; Body = $partial }
  }
  if ($fixtureStage -eq 'disable-drift' -and -not $restored -and $state.ProtectionReads -eq 2) {
    $drifted = Copy-FixtureProtection
    $drifted.enforce_admins.enabled = $false
    $drifted.required_status_checks.strict = $false
    return [pscustomobject]@{ Status = 200; Body = $drifted }
  }
  $restoreRead = $state.RestoreCalls -eq 1 -and $state.ProtectionReads -eq 3
  if ($fixtureStage -eq 'restore-protection-read' -and $restoreRead) {
    throw 'restore protection read failed'
  }
  if ($fixtureStage -eq 'malformed-restore' -and $restored) {
    return [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ broken = $true } }
  }
  if ($fixtureStage -eq 'restore-mismatch' -and $restored) {
    $mismatched = Copy-FixtureProtection
    $mismatched.allow_force_pushes.enabled = $false
    return [pscustomobject]@{ Status = 200; Body = $mismatched }
  }
  if ($fixtureStage -eq 'allow-force-string' -and $first) {
    $invalid = Copy-FixtureProtection
    $invalid.allow_force_pushes.enabled = 'true'
    return [pscustomobject]@{ Status = 200; Body = $invalid }
  }
  if ($fixtureStage -eq 'initial-disabled' -and $first) {
    $disabled = Copy-FixtureProtection
    $disabled.enforce_admins.enabled = $false
    return [pscustomobject]@{ Status = 200; Body = $disabled }
  }
  if (-not $restored -and $state.ProtectionReads -gt 1) {
    $adminDisabled = [pscustomobject]@{
      url = $fixtureProtection.url
      allow_force_pushes = [pscustomobject]@{ enabled = $true }
      enforce_admins = [pscustomobject]@{ enabled = $false }
      required_status_checks = $fixtureProtection.required_status_checks
    }
    return [pscustomobject]@{ Status = 200; Body = $adminDisabled }
  }
  [void]$events.Add(('protection-body=' + ($fixtureProtection | ConvertTo-Json -Compress)))
  return [pscustomobject]@{ Status = 200; Body = $fixtureProtection }
}
`;

const MAINTENANCE_5 = String.raw`$readAdmin = {
  $state.AdminReads++
  $first = $state.AdminReads -eq 1
  $disabled = [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $false } }
  $enabled = [pscustomobject]@{ Status = 200; Body = [pscustomobject]@{ enabled = $true } }
  if ($fixtureStage -eq 'initial-admin-mismatch' -and $first) { return $disabled }
  $afterDisable = $state.RestoreCalls -eq 0 -and $state.AdminReads -eq 2
  if ($fixtureStage -eq 'admin-still-enabled' -and $afterDisable) { return $enabled }
  if ($fixtureStage -eq 'initial-disabled' -and $first) { return $disabled }
  if ($state.RestoreCalls -eq 0 -and $state.AdminReads -gt 1) { return $disabled }
  [void]$events.Add('admin-body-enabled=' + ([string]$true))
  return $enabled
}
`;

const MAINTENANCE_6 = String.raw`if ($env:DOD_GUARD_USE_DEFAULT_GH -eq 'true') {
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
    $expectedArguments = @('api', '--method', $expectedMethod, $expectedEndpoint, '--include')
    if ($Arguments.Count -ne 5 -or ($Arguments -join ' ') -ne ($expectedArguments -join ' ')) {
      throw ('unexpected gh arguments: ' + ($Arguments -join ' '))
    }
    Write-FixtureGhResponse
  }
  $invokeGhApi = $null
}
`;

const MAINTENANCE_7 = String.raw`function Write-FixtureGhResponse {
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
`;

const MAINTENANCE_8 = String.raw`$commitAction = {
  [void]$events.Add('commit')
  if ($fixtureStage -eq 'commit') { throw 'commit failed' }
  if ($fixtureStage -eq 'native') { cmd.exe /c exit 7 }
  $state.HeadSha = $state.ReleaseSha
  $state.ParentSha = $savedSha
}
$prePushAction = {
  [void]$events.Add('pre-push')
  if ($fixtureStage -eq 'pre-push') { throw 'pre-push failed' }
  if ($fixtureStage -eq 'head') { $state.HeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  if ($fixtureStage -eq 'parent') { $state.ParentSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
}
$publishArguments = @{
  Owner = 'TychoHenzen'
  Repo = 'dod-guard'
  SavedSha = $savedSha
  CommitAction = $commitAction
  PrePushAction = $prePushAction
  InvokeGit = $invokeGit
  InvokeGhApi = $invokeGhApi
}
$result = Invoke-MaintenancePublish @publishArguments
[pscustomobject]@{ Result = $result; Events = @($events) } | ConvertTo-Json -Depth 20 -Compress
`;

const MAINTENANCE_CHUNKS = [
  MAINTENANCE_1,
  MAINTENANCE_2,
  MAINTENANCE_3,
  MAINTENANCE_4,
  MAINTENANCE_5,
  MAINTENANCE_6,
  MAINTENANCE_7,
  MAINTENANCE_8,
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
