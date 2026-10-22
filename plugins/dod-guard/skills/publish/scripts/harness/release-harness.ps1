
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
function New-FixtureCheckRun([string]$Name, [string]$Conclusion) {
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
if ($env:DOD_GUARD_FIXTURE_ROOT) {
  $marketplaceSource = [pscustomobject]@{ sourceType = 'git'; source = 'https://github.com/TychoHenzen/dod-guard.git' }
  $localSource = [pscustomobject]@{ source = 'local'; path = $env:DOD_GUARD_FIXTURE_ROOT }
  $codexPlugin | Add-Member -NotePropertyName source -NotePropertyValue $localSource
  $codexPlugin | Add-Member -NotePropertyName marketplaceSource -NotePropertyValue $marketplaceSource
}
$codexRegistry = @{ installed = @($codexPlugin) } | ConvertTo-Json -Depth 10 -Compress
$claudePlugin = [pscustomobject]@{ id = 'dod-guard@dod-guard'; version = $version; enabled = $true }
if ($env:DOD_GUARD_FIXTURE_ROOT) {
  $claudePlugin | Add-Member -NotePropertyName installPath -NotePropertyValue $env:DOD_GUARD_FIXTURE_ROOT
}
$claudeRegistry = ConvertTo-Json -InputObject @($claudePlugin) -Depth 10 -Compress
