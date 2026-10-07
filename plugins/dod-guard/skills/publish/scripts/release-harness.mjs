import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runPowerShell } from "./maintenance-harness.mjs";

// PowerShell harness for release-verification.ps1; DOD_GUARD_FAILURE_STAGE picks the
// evidence a test corrupts.
export const releaseVerificationPath = fileURLToPath(new URL("./release-verification.ps1", import.meta.url));

const RELEASE_1 = `
$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_RELEASE_VERIFICATION
$publishedSha = 'fedcba9876543210fedcba9876543210fedcba98'
$parentSha = '0123456789abcdef0123456789abcdef01234567'
$version = '5.4.56'
$protectionEndpoint = 'repos/TychoHenzen/dod-guard/branches/master/protection'
$adminEndpoint = $protectionEndpoint + '/enforce_admins'
$checksEndpoint = $protectionEndpoint.Replace('/branches/master/protection', '/commits/' + $publishedSha + '/check-runs?per_page=100')
$requiredChecks = @('build-test', 'plugin-config', 'static-analysis', 'package-integrity')
$protection = [pscustomobject]@{
  url = 'https://api.github.com/repos/TychoHenzen/dod-guard/branches/master/protection'
  enforce_admins = [pscustomobject]@{ enabled = $true }
  allow_force_pushes = [pscustomobject]@{ enabled = $true }
  required_status_checks = [pscustomobject]@{
    contexts = $requiredChecks
    checks = @(
      [pscustomobject]@{ context = 'build-test' }
      [pscustomobject]@{ context = 'plugin-config' }
      [pscustomobject]@{ context = 'static-analysis' }
      [pscustomobject]@{ context = 'package-integrity' }
    )
  }
}
`;

const RELEASE_2 = `$checkRuns = @(
  foreach ($name in $requiredChecks) {
    [pscustomobject]@{ name = $name; head_sha = $publishedSha; status = 'completed'; conclusion = 'success' }
  }
)
if ($env:DOD_GUARD_FAILURE_STAGE -eq 'checks') { $checkRuns = @($checkRuns | Select-Object -First 3) }
if ($env:DOD_GUARD_FAILURE_STAGE -eq 'duplicate-check') {
  $checkRuns = @(
    [pscustomobject]@{ name = 'build-test'; head_sha = $publishedSha; status = 'completed'; conclusion = 'success' }
    [pscustomobject]@{ name = 'build-test'; head_sha = $publishedSha; status = 'completed'; conclusion = 'failure' }
    $checkRuns | Where-Object { $_.name -ne 'build-test' }
  )
}
$codexRegistry = @{ installed = @([pscustomobject]@{ pluginId = 'dod-guard@dod-guard-monorepo'; name = 'dod-guard'; marketplaceName = 'dod-guard-monorepo'; version = $version; enabled = $true; installed = $true }) } | ConvertTo-Json -Depth 10 -Compress
$claudeRegistry = @([pscustomobject]@{ id = 'dod-guard@dod-guard'; version = $version; enabled = $true }) | ConvertTo-Json -Depth 10 -Compress
`;

const RELEASE_3 = `$invokeCommand = {
  param([string]$Executable, [string[]]$Arguments, [AllowNull()][string]$InputText)
  $key = $Executable + ' ' + ($Arguments -join ' ')
  if ($env:DOD_GUARD_FAILURE_STAGE -eq 'command' -and $key -eq 'git rev-parse HEAD') {
    return [pscustomobject]@{ ExitCode = 7; Output = '' }
  }
  if ($Executable -eq 'git' -and $Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD') {
    $head = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'head') { 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } else { $publishedSha }
    return [pscustomobject]@{ ExitCode = 0; Output = $head }
  }
  if ($Executable -eq 'git' -and $Arguments[0] -eq 'rev-parse' -and $Arguments[1] -eq 'HEAD^') {
    $parent = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'parent') { 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } else { $parentSha }
    return [pscustomobject]@{ ExitCode = 0; Output = $parent }
  }
  if ($Executable -eq 'git' -and $Arguments[0] -eq 'ls-remote') {
    $remoteSha = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'remote') { 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } else { $publishedSha }
    return [pscustomobject]@{ ExitCode = 0; Output = ($remoteSha + [char]9 + 'refs/heads/master') }
  }
`;

const RELEASE_4 = `  if ($Executable -eq 'gh') {
    if ($Arguments[3] -eq $protectionEndpoint) {
      $body = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'malformed') { '{' } else { $protection | ConvertTo-Json -Depth 10 -Compress }
      return [pscustomobject]@{ ExitCode = 0; Output = ('HTTP/2.0 200 OK' + [char]10 + 'Content-Type: application/json' + [char]10 + [char]10 + $body) }
    }
    if ($Arguments[3] -eq $adminEndpoint) {
      return [pscustomobject]@{ ExitCode = 0; Output = ('HTTP/2.0 200 OK' + [char]10 + 'Content-Type: application/json' + [char]10 + [char]10 + '{"enabled":true}') }
    }
    if ($Arguments[3] -eq $checksEndpoint) {
      $body = [pscustomobject]@{ total_count = $checkRuns.Count; check_runs = $checkRuns } | ConvertTo-Json -Depth 10 -Compress
      return [pscustomobject]@{ ExitCode = 0; Output = ('HTTP/2.0 200 OK' + [char]10 + 'Content-Type: application/json' + [char]10 + [char]10 + $body) }
    }
    throw ('unexpected gh endpoint: ' + $Arguments[3])
  }
`;

const RELEASE_5 = `  if ($Executable -eq 'codex' -and $Arguments[0] -eq 'plugin') {
    return [pscustomobject]@{ ExitCode = 0; Output = $codexRegistry }
  }
  if ($Executable -eq 'claude' -and $Arguments[0] -eq 'plugin') {
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'inventory') { return [pscustomobject]@{ ExitCode = 9; Output = '' } }
    return [pscustomobject]@{ ExitCode = 0; Output = $claudeRegistry }
  }
  if ($Executable -eq 'node') {
    $client = $Arguments[1]
    if ($env:DOD_GUARD_FAILURE_STAGE -eq 'preflight-malformed' -and $client -eq 'codex') {
      return [pscustomobject]@{ ExitCode = 0; Output = '{' }
    }
    if ($client -eq 'codex') {
      $preflightVersion = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'version') { '5.4.55' } else { $version }
      $identity = if ($env:DOD_GUARD_FAILURE_STAGE -eq 'identity') {
        [pscustomobject]@{ pluginId = 'other@marketplace'; name = 'other-plugin'; marketplaceName = 'other-marketplace' }
      } else {
        [pscustomobject]@{ pluginId = 'dod-guard@dod-guard-monorepo'; name = 'dod-guard'; marketplaceName = 'dod-guard-monorepo' }
      }
      $preflight = [pscustomobject]@{ ok = $true; client = $client; version = $preflightVersion; pluginRoot = 'C:\plugin'; skillPath = 'C:\plugin\skills\publish\SKILL.md'; pluginIdentity = $identity }
    } else {
      $preflight = [pscustomobject]@{ ok = $true; client = $client; version = $version; pluginRoot = 'C:\plugin'; skillPath = 'C:\plugin\skills\publish\SKILL.md'; pluginIdentity = [pscustomobject]@{ id = 'dod-guard@dod-guard' } }
    }
    return [pscustomobject]@{ ExitCode = 0; Output = ($preflight | ConvertTo-Json -Depth 10 -Compress) }
  }
  throw ('unexpected command: ' + $key)
}
$result = Invoke-ReleaseVerification -Owner 'TychoHenzen' -Repo 'dod-guard' -PublishedSha $publishedSha -ExpectedParentSha $parentSha -ExpectedVersion $version -InvokeCommand $invokeCommand
$result | ConvertTo-Json -Depth 20 -Compress
`;

function releaseVerificationHarness() {
  return [RELEASE_1, RELEASE_2, RELEASE_3, RELEASE_4, RELEASE_5].join("");
}

export function runReleaseVerification(failureStage = "") {
  const result = runPowerShell(releaseVerificationHarness(failureStage), {
    DOD_GUARD_RELEASE_VERIFICATION: releaseVerificationPath,
    DOD_GUARD_FAILURE_STAGE: failureStage,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}
