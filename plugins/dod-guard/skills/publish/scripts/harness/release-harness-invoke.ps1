$invokeCommand = {
  param([string]$Executable, [string[]]$Arguments, [AllowNull()][string]$InputText)
  $key = $Executable + ' ' + ($Arguments -join ' ')
  if ($fixtureStage -eq 'command' -and $key -eq 'git rev-parse HEAD') {
    return [pscustomobject]@{ ExitCode = 7; Output = ''; Stderr = 'fatal: not a git repository' }
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
    if ($fixtureStage -eq 'codex-inventory-nonzero') {
      return [pscustomobject]@{ ExitCode = 1; Output = $codexRegistry; Stderr = 'warning: marketplace broken' }
    }
    if ($fixtureStage -eq 'codex-inventory-nonzero-missing') {
      return [pscustomobject]@{ ExitCode = 1; Output = '{"installed":[]}' }
    }
    if ($fixtureStage -eq 'codex-inventory-nonzero-malformed') {
      return [pscustomobject]@{ ExitCode = 1; Output = 'warning: marketplace broken' }
    }
    return [pscustomobject]@{ ExitCode = 0; Output = $codexRegistry }
  }
  if ($Executable -eq 'claude' -and $Arguments[0] -eq 'plugin') {
    if ($fixtureStage -eq 'inventory') { return [pscustomobject]@{ ExitCode = 9; Output = '' } }
    return [pscustomobject]@{ ExitCode = 0; Output = $claudeRegistry }
  }
  if ($Executable -eq 'node' -and $env:DOD_GUARD_FIXTURE_HELPER) {
    $helperArguments = @($env:DOD_GUARD_FIXTURE_HELPER) + @($Arguments | Select-Object -Skip 1)
    return (Invoke-PublishNativeCommand 'node' $helperArguments $InputText)
  }
  if ($Executable -eq 'node') { return (& $answerPreflight $Arguments[1]) }
  throw ('unexpected command: ' + $key)
}
