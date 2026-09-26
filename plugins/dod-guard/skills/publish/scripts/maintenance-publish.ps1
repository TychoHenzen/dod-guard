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

    $status = Get-MaintenancePropertyValue $Response "Status"
    if ($status -isnot [int] -and $status -isnot [long]) {
        return $null
    }
    return [int]$status
}

function Get-MaintenancePropertyValue {
    param(
        [AllowNull()][object]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-MaintenanceBooleanProperty {
    param(
        [AllowNull()][object]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-MaintenancePropertyValue $Object $Name
    if ($value -isnot [bool]) {
        return $null
    }
    return $value
}

function Test-MaintenanceResponseBoolean {
    param(
        [AllowNull()][object]$Response,
        [Parameter(Mandatory = $true)][bool]$Expected
    )

    if ((Get-MaintenanceResponseStatus $Response) -ne 200) {
        return $false
    }
    $body = Get-MaintenancePropertyValue $Response "Body"
    $value = Get-MaintenanceBooleanProperty $body "enabled"
    return $null -ne $value -and $value -eq $Expected
}

function Test-MaintenanceProtectionResponse {
    param([AllowNull()][object]$Response)

    if ((Get-MaintenanceResponseStatus $Response) -ne 200) {
        return $false
    }
    $body = Get-MaintenancePropertyValue $Response "Body"
    return $null -ne $body -and @($body.PSObject.Properties).Count -gt 0
}

function Test-MaintenanceProtectionAdminState {
    param(
        [AllowNull()][object]$Response,
        [Parameter(Mandatory = $true)][bool]$Expected
    )

    $body = Get-MaintenancePropertyValue $Response "Body"
    $enforceAdmins = Get-MaintenancePropertyValue $body "enforce_admins"
    $value = Get-MaintenanceBooleanProperty $enforceAdmins "enabled"
    return $null -ne $value -and $value -eq $Expected
}

function Test-MaintenanceProtectionWithoutAdmin {
    param(
        [AllowNull()][object]$Expected,
        [AllowNull()][object]$Observed
    )

    if (
        $null -eq (Get-MaintenancePropertyValue $Expected "enforce_admins") -or
        $null -eq (Get-MaintenancePropertyValue $Observed "enforce_admins")
    ) {
        return $false
    }
    return Test-MaintenanceEqual (Remove-MaintenanceAdminField $Expected) (Remove-MaintenanceAdminField $Observed)
}

function Test-MaintenanceEmptyResponseBody {
    param([AllowNull()][object]$Response)

    $body = Get-MaintenancePropertyValue $Response "Body"
    return $null -eq $body -or ($body -is [string] -and [string]::IsNullOrWhiteSpace($body))
}

function Get-MaintenanceRestoreDifference {
    param(
        [AllowNull()][object]$SavedProtection,
        [AllowNull()][object]$RestoredProtection,
        [AllowNull()][object]$RestoredAdmin,
        [AllowNull()][object]$RestoreResponse,
        [AllowNull()][object]$RestoreError
    )

    $differences = @()
    if ($null -ne $RestoreError) {
        $differences += "restore request error: $($RestoreError.Message)"
    } elseif ((Get-MaintenanceResponseStatus $RestoreResponse) -ne 200) {
        $differences += "restore response status: $((Get-MaintenanceResponseStatus $RestoreResponse))"
    }

    if (-not (Test-MaintenanceResponseBoolean $RestoredAdmin $true)) {
        $differences += "admin readback: expected status=200 and enabled=true, actual=$((Get-MaintenancePropertyValue $RestoredAdmin 'Body') | ConvertTo-Json -Compress)"
    }
    if (-not (Test-MaintenanceProtectionResponse ([pscustomobject]@{ Status = 200; Body = $RestoredProtection }))) {
        $differences += "protection readback: expected a non-empty object, actual=$($RestoredProtection | ConvertTo-Json -Depth 100 -Compress)"
    } elseif (-not (Test-MaintenanceEqual $SavedProtection $RestoredProtection)) {
        $expectedJson = ConvertTo-MaintenanceCanonicalValue $SavedProtection | ConvertTo-Json -Depth 100 -Compress
        $actualJson = ConvertTo-MaintenanceCanonicalValue $RestoredProtection | ConvertTo-Json -Depth 100 -Compress
        $differences += "protection snapshot: expected=$expectedJson; actual=$actualJson"
    }

    if ($differences.Count -eq 0) {
        return "restoration readback did not match the saved snapshot"
    }
    return $differences -join "; "
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

    $global:LASTEXITCODE = 0
    $output = @(& $Action)
    $exitCode = $global:LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode"
    }
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
    $releaseSha = $null

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
        $initialProtectionBody = Get-MaintenancePropertyValue $initialProtectionResponse "Body"
        $initialAdminBody = Get-MaintenancePropertyValue $initialAdminResponse "Body"
        $initialProtectionAdmin = Get-MaintenancePropertyValue $initialProtectionBody "enforce_admins"
        $initialProtectionAdminEnabled = Get-MaintenanceBooleanProperty $initialProtectionAdmin "enabled"
        $initialAdminEnabledValue = Get-MaintenanceBooleanProperty $initialAdminBody "enabled"
        $allowForcePushes = Get-MaintenancePropertyValue $initialProtectionBody "allow_force_pushes"
        $allowForcePushesEnabled = Get-MaintenanceBooleanProperty $allowForcePushes "enabled"
        if (
            (Get-MaintenanceResponseStatus $initialProtectionResponse) -ne 200 -or
            $null -eq $initialProtectionBody -or
            @($initialProtectionBody.PSObject.Properties).Count -eq 0 -or
            (Get-MaintenanceResponseStatus $initialAdminResponse) -ne 200 -or
            $null -eq $initialAdminBody -or
            @($initialAdminBody.PSObject.Properties).Count -eq 0 -or
            $null -eq $initialProtectionAdminEnabled -or
            $null -eq $initialAdminEnabledValue -or
            $initialProtectionAdminEnabled -ne $initialAdminEnabledValue
        ) {
            throw "initial protection readback is invalid"
        }
        if ($allowForcePushesEnabled -ne $true) {
            throw "allow_force_pushes.enabled must be true"
        }

        $savedProtection = $initialProtectionBody
        $initialAdminEnabled = $initialAdminEnabledValue
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
            if (
                (Get-MaintenanceResponseStatus $deleteResponse) -ne 204 -or
                -not (Test-MaintenanceEmptyResponseBody $deleteResponse)
            ) {
                throw "admin disable must return HTTP 204"
            }

            if (
                -not (Test-MaintenanceResponseBoolean $disabledState.Admin $false) -or
                -not (Test-MaintenanceProtectionResponse $disabledState.Protection) -or
                -not (Test-MaintenanceProtectionAdminState $disabledState.Protection $false) -or
                -not (Test-MaintenanceProtectionWithoutAdmin $savedProtection (Get-MaintenancePropertyValue $disabledState.Protection "Body"))
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
        $releaseSha = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD")

        $result.Stage = "pre-push"
        Invoke-MaintenanceAction $PrePushAction "pre-push validation"
        $headAfterPrePush = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD")
        $parentAfterPrePush = Invoke-MaintenanceGit $InvokeGit @("rev-parse", "HEAD^")
        if ($headAfterPrePush -ne $releaseSha) {
            throw "HEAD changed during pre-push validation from $releaseSha to $headAfterPrePush"
        }
        if ($parentAfterPrePush -ne $SavedSha) {
            throw "release commit parent changed during pre-push validation from $SavedSha to $parentAfterPrePush"
        }
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
                        (Test-MaintenanceResponseBoolean $restoredState.Admin $true) -and
                        (Test-MaintenanceProtectionResponse $restoredState.Protection) -and
                        (Test-MaintenanceProtectionAdminState $restoredState.Protection $true) -and
                        (Test-MaintenanceEqual $savedProtection (Get-MaintenancePropertyValue $restoredState.Protection "Body"))
                    ) {
                        $result.Restored = $true
                        break
                    }

                    $result.Error = Get-MaintenanceRestoreDifference `
                        $savedProtection `
                        (Get-MaintenancePropertyValue $restoredState.Protection "Body") `
                        $restoredState.Admin `
                        $restoreResponse `
                        $restoreError
                }
            } else {
                try {
                    $unchangedState = Get-MaintenanceState $InvokeGhApi $protectionEndpoint $adminEndpoint
                    $result.Restored =
                        (Test-MaintenanceResponseBoolean $unchangedState.Admin $false) -and
                        (Test-MaintenanceProtectionResponse $unchangedState.Protection) -and
                        (Test-MaintenanceProtectionAdminState $unchangedState.Protection $false) -and
                        (Test-MaintenanceEqual $savedProtection (Get-MaintenancePropertyValue $unchangedState.Protection "Body"))
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
