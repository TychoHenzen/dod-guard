Set-StrictMode -Version Latest

function ConvertTo-MaintenanceCanonicalValue {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $canonical = [ordered]@{}
        foreach ($key in ($Value.Keys | Sort-Object)) {
            $canonical[$key] = ConvertTo-MaintenanceCanonicalValue $Value[$key]
        }
        return $canonical
    }

    if ($Value -is [pscustomobject]) {
        $canonical = [ordered]@{}
        foreach ($property in ($Value.PSObject.Properties | Sort-Object Name)) {
            $canonical[$property.Name] = ConvertTo-MaintenanceCanonicalValue $property.Value
        }
        return $canonical
    }

    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        $canonical = @(
            foreach ($item in $Value) {
                ConvertTo-MaintenanceCanonicalValue $item
            }
        )
        return ,$canonical
    }

    return $Value
}

function Test-MaintenanceEqual {
    param([AllowNull()][object]$Left, [AllowNull()][object]$Right)

    $leftJson = ConvertTo-MaintenanceCanonicalValue $Left | ConvertTo-Json -Depth 100 -Compress
    $rightJson = ConvertTo-MaintenanceCanonicalValue $Right | ConvertTo-Json -Depth 100 -Compress
    return $leftJson -eq $rightJson
}

function Remove-MaintenanceAdminField {
    param([AllowNull()][object]$Protection)

    if ($null -eq $Protection -or $null -eq $Protection.PSObject.Properties["enforce_admins"]) {
        return $null
    }

    $withoutAdmin = [ordered]@{}
    foreach ($property in $Protection.PSObject.Properties) {
        if ($property.Name -ne "enforce_admins") {
            $withoutAdmin[$property.Name] = $property.Value
        }
    }
    return $withoutAdmin
}

function Get-MaintenanceResponseStatus {
    param([AllowNull()][object]$Response)

    if ($null -eq $Response -or $null -eq $Response.PSObject.Properties["Status"]) {
        return $null
    }
    return [int]$Response.Status
}

function Get-MaintenanceState {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$InvokeGhApi,
        [Parameter(Mandatory = $true)][string]$ProtectionEndpoint,
        [Parameter(Mandatory = $true)][string]$AdminEndpoint
    )

    $protection = $null
    $protectionError = $null
    try {
        $protection = & $InvokeGhApi "GET" $ProtectionEndpoint
    } catch {
        $protectionError = $_.Exception
    }

    $admin = $null
    $adminError = $null
    try {
        $admin = & $InvokeGhApi "GET" $AdminEndpoint
    } catch {
        $adminError = $_.Exception
    }

    if ($null -ne $protectionError) {
        throw $protectionError
    }
    if ($null -ne $adminError) {
        throw $adminError
    }

    return [pscustomobject]@{
        Protection = $protection
        Admin = $admin
    }
}

function Invoke-MaintenanceGit {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$InvokeGit,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = @(& $InvokeGit -Arguments $Arguments)
    if ($output.Count -eq 0) {
        return ""
    }
    return (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
}

function Invoke-MaintenanceAction {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $output = @(& $Action)
    if ($output.Count -eq 0) {
        return
    }

    $last = $output[$output.Count - 1]
    if ($last -is [int] -and $last -ne 0) {
        throw "$Name failed with exit code $last"
    }
    if ($null -ne $last.PSObject.Properties["ExitCode"] -and [int]$last.ExitCode -ne 0) {
        throw "$Name failed with exit code $($last.ExitCode)"
    }
}

function Invoke-MaintenancePublish {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][ValidatePattern("^[A-Za-z0-9_.-]+$")][string]$Owner,
        [Parameter(Mandatory = $true)][ValidatePattern("^[A-Za-z0-9_.-]+$")][string]$Repo,
        [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-fA-F]{40}$")][string]$SavedSha,
        [Parameter(Mandatory = $true)][scriptblock]$CommitAction,
        [Parameter(Mandatory = $true)][scriptblock]$PrePushAction,
        [scriptblock]$InvokeGit,
        [scriptblock]$InvokeGhApi
    )

    if ($null -eq $InvokeGit) {
        $InvokeGit = {
            param([string[]]$Arguments)
            $output = @(& git @Arguments 2>&1)
            if ($LASTEXITCODE -ne 0) {
                throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
            }
            $output
        }
    }
    if ($null -eq $InvokeGhApi) {
        $InvokeGhApi = {
            param([string]$Method, [string]$Endpoint)
            $output = @(& gh api --method $Method $Endpoint --include 2>&1)
            $exitCode = $LASTEXITCODE
            if ($exitCode -ne 0) {
                throw "gh api $Method $Endpoint failed with exit code $exitCode"
            }

            $text = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
            $statusMatch = [regex]::Match($text, "(?m)^HTTP/\S+\s+(\d{3})[^\r\n]*\r?$")
            if (-not $statusMatch.Success) {
                throw "gh api $Method $Endpoint returned no HTTP status"
            }

            $body = $null
            $separator = $text.IndexOf(([Environment]::NewLine + [Environment]::NewLine))
            if ($separator -lt 0) {
                $separator = $text.IndexOf("`n`n")
            }
            if ($separator -ge 0) {
                $bodyText = $text.Substring($separator).Trim()
                if ($bodyText.Length -gt 0) {
                    $body = $bodyText | ConvertFrom-Json
                }
            }

            [pscustomobject]@{
                Status = [int]$statusMatch.Groups[1].Value
                Body = $body
            }
        }
    }

    $protectionEndpoint = "repos/$Owner/$Repo/branches/master/protection"
    $adminEndpoint = "$protectionEndpoint/enforce_admins"
    $adminMethod = "DELETE"
    $lease = "--force-with-lease=refs/heads/master:$SavedSha"
    $result = [ordered]@{
        Success = $false
        Stage = "preflight"
        Error = $null
        SavedSha = $SavedSha
        Lease = $lease
        ProtectionEndpoint = $protectionEndpoint
        AdminEndpoint = $adminEndpoint
        AdminMethod = $adminMethod
        RestoreAttempts = 0
        Restored = $false
        ReleaseSha = $null
    }
    $savedProtection = $null
    $initialAdminEnabled = $false
    $releaseError = $null

    try {
        $gitDirectory = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "--path-format=absolute", "--git-dir")
        $commonDirectory = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "--path-format=absolute", "--git-common-dir")
        if ([StringComparer]::OrdinalIgnoreCase.Equals($gitDirectory, $commonDirectory) -eq $false) {
            throw "maintenance publish requires the primary checkout"
        }

        $head = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD")
        if ($head -ne $SavedSha) {
            throw "HEAD $head does not equal saved master SHA $SavedSha"
        }

        $initialState = Get-MaintenanceState $InvokeGhApi $protectionEndpoint $adminEndpoint
        $initialProtectionResponse = $initialState.Protection
        $initialAdminResponse = $initialState.Admin
        if (
            (Get-MaintenanceResponseStatus $initialProtectionResponse) -ne 200 -or
            $null -eq $initialProtectionResponse.Body -or
            @($initialProtectionResponse.Body.PSObject.Properties).Count -eq 0 -or
            $null -eq $initialProtectionResponse.Body.PSObject.Properties["enforce_admins"] -or
            $initialProtectionResponse.Body.enforce_admins.enabled -isnot [bool] -or
            (Get-MaintenanceResponseStatus $initialAdminResponse) -ne 200 -or
            $null -eq $initialAdminResponse.Body -or
            $initialAdminResponse.Body.enabled -isnot [bool] -or
            $initialProtectionResponse.Body.enforce_admins.enabled -ne $initialAdminResponse.Body.enabled
        ) {
            throw "initial protection readback is invalid"
        }
        if ($initialProtectionResponse.Body.allow_force_pushes.enabled -ne $true) {
            throw "allow_force_pushes.enabled must be true"
        }

        $savedProtection = $initialProtectionResponse.Body
        $initialAdminEnabled = [bool]$initialAdminResponse.Body.enabled
        if ($initialAdminEnabled) {
            $result.Stage = "disable-admin"
            $deleteResponse = $null
            $deleteError = $null
            try {
                $deleteResponse = & $InvokeGhApi $adminMethod $adminEndpoint
            } catch {
                $deleteError = $_.Exception
            }

            $disabledState = $null
            $disabledReadbackError = $null
            try {
                $disabledState = Get-MaintenanceState $InvokeGhApi $protectionEndpoint $adminEndpoint
            } catch {
                $disabledReadbackError = $_.Exception
            }

            if ($null -ne $deleteError) {
                throw $deleteError
            }
            if ($null -ne $disabledReadbackError) {
                throw $disabledReadbackError
            }
            if ((Get-MaintenanceResponseStatus $deleteResponse) -ne 204) {
                throw "admin disable must return HTTP 204"
            }

            if (
                (Get-MaintenanceResponseStatus $disabledState.Admin) -ne 200 -or
                $disabledState.Admin.Body.enabled -ne $false -or
                (Get-MaintenanceResponseStatus $disabledState.Protection) -ne 200 -or
                -not (Test-MaintenanceEqual (Remove-MaintenanceAdminField $savedProtection) (Remove-MaintenanceAdminField $disabledState.Protection.Body))
            ) {
                throw "admin disable readback is invalid"
            }
        }

        $result.Stage = "commit"
        Invoke-MaintenanceAction $CommitAction "commit"
        $parentSha = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD^")
        if ($parentSha -ne $SavedSha) {
            throw "release commit parent $parentSha does not equal saved master SHA $SavedSha"
        }

        $result.Stage = "pre-push"
        Invoke-MaintenanceAction $PrePushAction "pre-push validation"
        $result.Stage = "push"
        [void](Invoke-MaintenanceGit $InvokeGit @("push", $lease, "origin", "HEAD:refs/heads/master"))
        $result.ReleaseSha = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD")
        $result.Success = $true
        $result.Stage = "complete"
    } catch {
        $releaseError = $_.Exception.Message
        $result.Error = $releaseError
        $result.Success = $false
    } finally {
        if ($null -ne $savedProtection) {
            $result.Stage = "restore"
            if ($initialAdminEnabled) {
                for ($attempt = 1; $attempt -le 2; $attempt++) {
                    $result.RestoreAttempts = $attempt
                    $restoreResponse = $null
                    $restoreError = $null
                    try {
                        $restoreResponse = & $InvokeGhApi "POST" $adminEndpoint
                    } catch {
                        $restoreError = $_.Exception
                    }

                    $restoredState = $null
                    $restoredReadbackError = $null
                    try {
                        $restoredState = Get-MaintenanceState $InvokeGhApi $protectionEndpoint $adminEndpoint
                    } catch {
                        $restoredReadbackError = $_.Exception
                    }

                    if ($null -ne $restoredReadbackError) {
                        $result.Error = $restoredReadbackError.Message
                        break
                    }

                    if (
                        $null -eq $restoreError -and
                        (Get-MaintenanceResponseStatus $restoreResponse) -eq 200 -and
                        (Get-MaintenanceResponseStatus $restoredState.Admin) -eq 200 -and
                        $restoredState.Admin.Body.enabled -eq $true -and
                        (Get-MaintenanceResponseStatus $restoredState.Protection) -eq 200 -and
                        (Test-MaintenanceEqual $savedProtection $restoredState.Protection.Body)
                    ) {
                        $result.Restored = $true
                        break
                    }

                    if ($null -ne $restoreError) {
                        $result.Error = $restoreError.Message
                    }
                }
            } else {
                try {
                    $unchangedState = Get-MaintenanceState $InvokeGhApi $protectionEndpoint $adminEndpoint
                    $result.Restored =
                        (Get-MaintenanceResponseStatus $unchangedState.Admin) -eq 200 -and
                        $unchangedState.Admin.Body.enabled -eq $false -and
                        (Get-MaintenanceResponseStatus $unchangedState.Protection) -eq 200 -and
                        (Test-MaintenanceEqual $savedProtection $unchangedState.Protection.Body)
                } catch {
                    $result.Error = $_.Exception.Message
                }
            }
            if (-not $result.Restored) {
                $result.Success = $false
                if ($null -eq $result.Error) {
                    $result.Error = "protection restoration readback did not match the saved snapshot"
                }
            }
        }
    }

    if ($null -ne $releaseError -and $result.Restored -and $result.Error -eq $null) {
        $result.Error = $releaseError
    }
    if ($result.Success -and -not $result.Restored) {
        $result.Success = $false
        $result.Error = "release completed without verified protection restoration"
    }
    return [pscustomobject]$result
}
