// String.raw keeps the Windows paths' backslashes intact when the script reaches powershell.exe.

export const DEFAULT_GH = String.raw`if ($env:DOD_GUARD_USE_DEFAULT_GH -eq 'true') {
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
export const GH_RESPONSE = String.raw`function Write-FixtureGhResponse {
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
