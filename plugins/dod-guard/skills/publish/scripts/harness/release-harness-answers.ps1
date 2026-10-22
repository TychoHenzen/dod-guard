$answerGh = {
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
$answerPreflight = {
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
