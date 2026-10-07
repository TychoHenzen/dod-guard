import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runPowerShell } from "./maintenance-harness.mjs";

// PowerShell harness for release-verification.ps1; DOD_GUARD_FAILURE_STAGE picks the
// evidence a test corrupts. String.raw keeps the Windows paths' backslashes.
export const releaseVerificationPath = fileURLToPath(new URL("./release-verification.ps1", import.meta.url));

const RELEASE_1 = String.raw`
$ErrorActionPreference = 'Stop'
. $env:DOD_GUARD_RELEASE_VERIFICATION
$fixtureStage = $env:DOD_GUARD_FAILURE_STAGE
$publishedSha = 'fedcba9876543210fedcba9876543210fedcba98'
$parentSha = '0123456789abcdef0123456789abcdef01234567'
$otherSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$version = '5.4.56'
$protectionEndpoint = 'repos/TychoHenzen/dod-guard/branches/master/protection'
$adminEndpoint = $protectionEndpoint + '/enforce_admins'
$checksPath = '/commits/' + $publishedSha + '/check-runs?per_page=100'
$checksEndpoint = $protectionEndpoint.Replace('/branches/master/protection', $checksPath)
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

const RELEASE_2 = String.raw`function New-FixtureCheckRun([string]$Name, [string]$Conclusion) {
  [pscustomobject]@{
    name = $Name
    head_sha = $publishedSha
    status = 'completed'
    conclusion = $Conclusion
  }
}
function New-FixtureHttpOutput([string]$Body) {
  $nl = [string][char]10
  'HTTP/2.0 200 OK' + $nl + 'Content-Type: application/json' + $nl + $nl + $Body
}
$checkRuns = @(foreach ($name in $requiredChecks) { New-FixtureCheckRun $name 'success' })
if ($fixtureStage -eq 'checks') { $checkRuns = @($checkRuns | Select-Object -First 3) }
if ($fixtureStage -eq 'duplicate-check') {
  $checkRuns = @(
    New-FixtureCheckRun 'build-test' 'success'
    New-FixtureCheckRun 'build-test' 'failure'
    $checkRuns | Where-Object { $_.name -ne 'build-test' }
  )
}
$codexPlugin = [pscustomobject]@{
  pluginId = 'dod-guard@dod-guard-monorepo'
  name = 'dod-guard'
  marketplaceName = 'dod-guard-monorepo'
  version = $version
  enabled = $true
  installed = $true
}
$codexRegistry = @{ installed = @($codexPlugin) } | ConvertTo-Json -Depth 10 -Compress
$claudePlugin = [pscustomobject]@{ id = 'dod-guard@dod-guard'; version = $version; enabled = $true }
$claudeRegistry = @($claudePlugin) | ConvertTo-Json -Depth 10 -Compress
`;

const RELEASE_3 = String.raw`$invokeCommand = {
  param([string]$Executable, [string[]]$Arguments, [AllowNull()][string]$InputText)
  $key = $Executable + ' ' + ($Arguments -join ' ')
  if ($fixtureStage -eq 'command' -and $key -eq 'git rev-parse HEAD') {
    return [pscustomobject]@{ ExitCode = 7; Output = '' }
  }
  $revParse = $Executable -eq 'git' -and $Arguments[0] -eq 'rev-parse'
  if ($revParse -and $Arguments[1] -eq 'HEAD') {
    $head = if ($fixtureStage -eq 'head') { $otherSha } else { $publishedSha }
    return [pscustomobject]@{ ExitCode = 0; Output = $head }
  }
  if ($revParse -and $Arguments[1] -eq 'HEAD^') {
    $parent = if ($fixtureStage -eq 'parent') { 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } else { $parentSha }
    return [pscustomobject]@{ ExitCode = 0; Output = $parent }
  }
  if ($Executable -eq 'git' -and $Arguments[0] -eq 'ls-remote') {
    $remoteSha = if ($fixtureStage -eq 'remote') { $otherSha } else { $publishedSha }
    return [pscustomobject]@{ ExitCode = 0; Output = ($remoteSha + [char]9 + 'refs/heads/master') }
  }
  if ($Executable -eq 'gh') { return (& $answerGh $Arguments) }
  if ($Executable -eq 'codex' -and $Arguments[0] -eq 'plugin') {
    return [pscustomobject]@{ ExitCode = 0; Output = $codexRegistry }
  }
  if ($Executable -eq 'claude' -and $Arguments[0] -eq 'plugin') {
    if ($fixtureStage -eq 'inventory') { return [pscustomobject]@{ ExitCode = 9; Output = '' } }
    return [pscustomobject]@{ ExitCode = 0; Output = $claudeRegistry }
  }
  if ($Executable -eq 'node') { return (& $answerPreflight $Arguments[1]) }
  throw ('unexpected command: ' + $key)
}
`;

const RELEASE_4 = String.raw`$answerGh = {
  param([string[]]$Arguments)
  if ($Arguments[3] -eq $protectionEndpoint) {
    $body = if ($fixtureStage -eq 'malformed') {
      '{'
    } else {
      $protection | ConvertTo-Json -Depth 10 -Compress
    }
    return [pscustomobject]@{ ExitCode = 0; Output = (New-FixtureHttpOutput $body) }
  }
  if ($Arguments[3] -eq $adminEndpoint) {
    return [pscustomobject]@{ ExitCode = 0; Output = (New-FixtureHttpOutput '{"enabled":true}') }
  }
  if ($Arguments[3] -eq $checksEndpoint) {
    $checks = [pscustomobject]@{ total_count = $checkRuns.Count; check_runs = $checkRuns }
    $body = $checks | ConvertTo-Json -Depth 10 -Compress
    return [pscustomobject]@{ ExitCode = 0; Output = (New-FixtureHttpOutput $body) }
  }
  throw ('unexpected gh endpoint: ' + $Arguments[3])
}
`;

const RELEASE_5 = String.raw`$answerPreflight = {
  param([string]$Client)
  if ($fixtureStage -eq 'preflight-malformed' -and $Client -eq 'codex') {
    return [pscustomobject]@{ ExitCode = 0; Output = '{' }
  }
  $preflight = [pscustomobject]@{
    ok = $true
    client = $Client
    version = $version
    pluginRoot = 'C:\plugin'
    skillPath = 'C:\plugin\skills\publish\SKILL.md'
    pluginIdentity = [pscustomobject]@{ id = 'dod-guard@dod-guard' }
  }
  if ($Client -eq 'codex') {
    if ($fixtureStage -eq 'version') { $preflight.version = '5.4.55' }
    $preflight.pluginIdentity = if ($fixtureStage -eq 'identity') {
      [pscustomobject]@{
        pluginId = 'other@marketplace'
        name = 'other-plugin'
        marketplaceName = 'other-marketplace'
      }
    } else {
      [pscustomobject]@{
        pluginId = 'dod-guard@dod-guard-monorepo'
        name = 'dod-guard'
        marketplaceName = 'dod-guard-monorepo'
      }
    }
  }
  return [pscustomobject]@{ ExitCode = 0; Output = ($preflight | ConvertTo-Json -Depth 10 -Compress) }
}
$verificationArguments = @{
  Owner = 'TychoHenzen'
  Repo = 'dod-guard'
  PublishedSha = $publishedSha
  ExpectedParentSha = $parentSha
  ExpectedVersion = $version
  InvokeCommand = $invokeCommand
}
$result = Invoke-ReleaseVerification @verificationArguments
$result | ConvertTo-Json -Depth 20 -Compress
`;

export function runReleaseVerification(failureStage = "") {
  const harness = [RELEASE_1, RELEASE_2, RELEASE_3, RELEASE_4, RELEASE_5].join("");
  const result = runPowerShell(harness, {
    DOD_GUARD_RELEASE_VERIFICATION: releaseVerificationPath,
    DOD_GUARD_FAILURE_STAGE: failureStage,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}
