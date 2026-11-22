// String.raw keeps the Windows paths' backslashes intact when the script reaches powershell.exe.

export const READ_PROTECTION = String.raw`$readProtection = {
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
export const READ_ADMIN = String.raw`$readAdmin = {
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
