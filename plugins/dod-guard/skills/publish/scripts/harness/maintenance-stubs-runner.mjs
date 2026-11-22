// String.raw keeps the Windows paths' backslashes intact when the script reaches powershell.exe.

export const INVOKE_GIT = String.raw`$invokeGit = {
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
  if ($Arguments[0] -eq 'push' -and $fixtureStage -in @('push', 'push-post')) { throw 'push failed' }
  if ($Arguments[0] -eq 'push') {
    $state.RemoteSha = $state.HeadSha
    return ''
  }
  if ($Arguments[0] -eq 'status' -and $Arguments[1] -eq '--porcelain' -and $Arguments[2] -eq '--untracked-files=no') {
    if ($fixtureStage -eq 'tracked-change') { return ' M packages/x.js' }
    return ''
  }
  if ($Arguments[0] -eq 'ls-remote' -and $Arguments[1] -eq 'origin' -and $Arguments[2] -eq 'refs/heads/master') {
    $remoteSha = $state.RemoteSha
    if ($fixtureStage -eq 'ls-remote-mismatch') { $remoteSha = 'cccccccccccccccccccccccccccccccccccccccc' }
    return ([string]$remoteSha + [char]9 + 'refs/heads/master')
  }
  throw ('unexpected git command: ' + ($Arguments -join ' '))
}
`;
export const INVOKE_GH_API = String.raw`function Copy-FixtureProtection {
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
    if ($fixtureStage -in @('post', 'push-post') -and $state.RestoreCalls -eq 1) { throw 'post failed' }
    return [pscustomobject]@{ Status = 200; Body = $null }
  }
  if ($Endpoint -like '*/protection') { return (& $readProtection) }
  return (& $readAdmin)
}
`;
export const PUBLISH_CALL = String.raw`$commitAction = {
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
