function ConvertTo-ReleaseVerificationText {
    param([AllowNull()][object[]]$Values)

    $lines = @(
        foreach ($value in @($Values)) {
            [string]$value
        }
    )
    if ($lines.Count -eq 0) {
        return ""
    }
    return ($lines -join [Environment]::NewLine).Trim()
}

function Invoke-ReleaseVerificationNativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowNull()][string]$InputText
    )

    $output = @()
    $global:LASTEXITCODE = 0
    if ($null -eq $InputText) {
        $output = @(& $Executable @Arguments 2>&1)
    } else {
        $output = @($InputText | & $Executable @Arguments 2>&1)
    }

    [pscustomobject]@{
        ExitCode = [int]$global:LASTEXITCODE
        Output = ConvertTo-ReleaseVerificationText $output
    }
}

function Get-ReleaseVerificationCommandText {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $parts = @($Executable) + @($Arguments)
    return ($parts -join " ")
}

function Invoke-ReleaseVerificationCommand {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$InvokeCommand,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowNull()][string]$InputText,
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Evidence
    )

    $command = Get-ReleaseVerificationCommandText $Executable $Arguments
    try {
        $response = & $InvokeCommand $Executable $Arguments $InputText
    } catch {
        $Evidence[$Name] = [ordered]@{
            Command = $command
            ExitCode = $null
            OutputPresent = $false
        }
        throw "$Name failed before exit status was captured: $($_.Exception.Message)"
    }

    if ($null -eq $response -or $null -eq $response.PSObject.Properties["ExitCode"]) {
        $Evidence[$Name] = [ordered]@{
            Command = $command
            ExitCode = $null
            OutputPresent = $false
        }
        throw "$Name returned no exit status"
    }

    $exitCode = [int]$response.ExitCode
    $output = if ($null -eq $response.PSObject.Properties["Output"]) { "" } else { [string]$response.Output }
    $Evidence[$Name] = [ordered]@{
        Command = $command
        ExitCode = $exitCode
        OutputPresent = -not [string]::IsNullOrEmpty($output)
    }
    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode"
    }
    return $output
}

function Get-ReleaseVerificationApiResponse {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$InvokeCommand,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Evidence
    )

    $text = Invoke-ReleaseVerificationCommand `
        $InvokeCommand `
        $Name `
        "gh" `
        @("api", "--method", "GET", $Endpoint, "--include") `
        $null `
        $Evidence
    $statusMatch = [regex]::Match($text, "(?m)^HTTP/\S+\s+(\d{3})[^\r\n]*\r?$")
    if (-not $statusMatch.Success) {
        throw "$Name returned no HTTP status"
    }

    $separator = $text.IndexOf(([Environment]::NewLine + [Environment]::NewLine))
    if ($separator -lt 0) {
        $separator = $text.IndexOf("`n`n")
    }
    $body = $null
    if ($separator -ge 0) {
        $bodyText = $text.Substring($separator).Trim()
        if ($bodyText.Length -gt 0) {
            try {
                $body = $bodyText | ConvertFrom-Json
            } catch {
                throw "$Name returned malformed JSON"
            }
        }
    }

    $response = [pscustomobject]@{
        Status = [int]$statusMatch.Groups[1].Value
        Body = $body
    }
    $Evidence[$Name].HttpStatus = $response.Status
    return $response
}

function Get-ReleaseVerificationProperty {
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

function Test-ReleaseVerificationObject {
    param([AllowNull()][object]$Value)

    return $null -ne $Value -and @($Value.PSObject.Properties).Count -gt 0
}

function Get-ReleaseVerificationRemoteHead {
    param([Parameter(Mandatory = $true)][string]$Output)

    $heads = @()
    foreach ($line in ($Output -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }
        $parts = $trimmed -split "\s+"
        if ($parts.Count -eq 2 -and $parts[1] -eq "refs/heads/master") {
            $heads += $parts[0]
        }
    }
    if ($heads.Count -ne 1 -or $heads[0] -notmatch "^[0-9a-fA-F]{40}$") {
        throw "remote master readback is malformed"
    }
    return $heads[0].ToLowerInvariant()
}

function Test-ReleaseVerificationChecks {
    param(
        [AllowNull()][object]$Body,
        [Parameter(Mandatory = $true)][string]$PublishedSha,
        [Parameter(Mandatory = $true)][string[]]$RequiredChecks
    )

    $checkRuns = Get-ReleaseVerificationProperty $Body "check_runs"
    if ($null -eq $checkRuns -or $checkRuns -is [string]) {
        throw "required checks response is missing check_runs"
    }

    foreach ($requiredCheck in $RequiredChecks) {
        $matches = @(
            foreach ($checkRun in @($checkRuns)) {
                if ((Get-ReleaseVerificationProperty $checkRun "name") -eq $requiredCheck) {
                    $checkRun
                }
            }
        )
        if ($matches.Count -eq 0) {
            throw "required check $requiredCheck is missing"
        }

        $matchingHead = @(
            foreach ($checkRun in $matches) {
                if ((Get-ReleaseVerificationProperty $checkRun "head_sha") -eq $PublishedSha) {
                    $checkRun
                }
            }
        )
        if ($matchingHead.Count -eq 0) {
            throw "required check $requiredCheck is on a different head"
        }

        $successful = @(
            foreach ($checkRun in $matchingHead) {
                if (
                    (Get-ReleaseVerificationProperty $checkRun "status") -eq "completed" -and
                    (Get-ReleaseVerificationProperty $checkRun "conclusion") -eq "success"
                ) {
                    $checkRun
                }
            }
        )
        if ($successful.Count -eq 0) {
            throw "required check $requiredCheck is not successful"
        }
    }
}

function Test-ReleaseVerificationProtection {
    param(
        [AllowNull()][object]$ProtectionResponse,
        [AllowNull()][object]$AdminResponse,
        [Parameter(Mandatory = $true)][string[]]$RequiredChecks
    )

    if ($ProtectionResponse.Status -ne 200 -or -not (Test-ReleaseVerificationObject $ProtectionResponse.Body)) {
        throw "complete protection readback is missing or not HTTP 200"
    }
    if ($AdminResponse.Status -ne 200 -or -not (Test-ReleaseVerificationObject $AdminResponse.Body)) {
        throw "enforce_admins readback is missing or not HTTP 200"
    }

    $enforceAdmins = Get-ReleaseVerificationProperty $ProtectionResponse.Body "enforce_admins"
    $adminEnabled = Get-ReleaseVerificationProperty $AdminResponse.Body "enabled"
    $protectionAdminEnabled = Get-ReleaseVerificationProperty $enforceAdmins "enabled"
    if ($adminEnabled -isnot [bool] -or $protectionAdminEnabled -isnot [bool] -or -not $adminEnabled -or -not $protectionAdminEnabled -or $adminEnabled -ne $protectionAdminEnabled) {
        throw "enforce_admins is not restored and enabled"
    }

    $allowForcePushes = Get-ReleaseVerificationProperty $ProtectionResponse.Body "allow_force_pushes"
    $allowForcePushesEnabled = Get-ReleaseVerificationProperty $allowForcePushes "enabled"
    if ($allowForcePushesEnabled -isnot [bool]) {
        throw "complete protection readback is missing allow_force_pushes.enabled"
    }

    $requiredStatusChecks = Get-ReleaseVerificationProperty $ProtectionResponse.Body "required_status_checks"
    if (-not (Test-ReleaseVerificationObject $requiredStatusChecks)) {
        throw "complete protection readback is missing required_status_checks"
    }
    $contexts = @(
        foreach ($context in @(Get-ReleaseVerificationProperty $requiredStatusChecks "contexts")) {
            [string]$context
        }
    )
    $configuredChecks = @(
        foreach ($check in @(Get-ReleaseVerificationProperty $requiredStatusChecks "checks")) {
            [string](Get-ReleaseVerificationProperty $check "context")
        }
    )
    foreach ($requiredCheck in $RequiredChecks) {
        if ($contexts -notcontains $requiredCheck -and $configuredChecks -notcontains $requiredCheck) {
            throw "protection required checks are missing $requiredCheck"
        }
    }
}

function Test-ReleaseVerificationClient {
    param(
        [Parameter(Mandatory = $true)][string]$Client,
        [AllowNull()][object]$Preflight,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    if ($null -eq $Preflight -or $Preflight.ok -ne $true) {
        throw "$Client installation preflight returned a failure"
    }
    if ($Preflight.version -ne $ExpectedVersion) {
        throw "$Client registration version does not match expected version"
    }
    $identity = Get-ReleaseVerificationProperty $Preflight "pluginIdentity"
    if (-not (Test-ReleaseVerificationObject $identity)) {
        throw "$Client registration identity is missing"
    }
    if ($Client -eq "codex") {
        if (
            (Get-ReleaseVerificationProperty $identity "pluginId") -ne "dod-guard@dod-guard-monorepo" -or
            (Get-ReleaseVerificationProperty $identity "name") -ne "dod-guard" -or
            (Get-ReleaseVerificationProperty $identity "marketplaceName") -ne "dod-guard-monorepo"
        ) {
            throw "Codex registration identity does not match dod-guard"
        }
    } elseif ((Get-ReleaseVerificationProperty $identity "id") -ne "dod-guard@dod-guard") {
        throw "Claude registration identity does not match dod-guard"
    }
}

function Invoke-ReleaseVerification {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][ValidatePattern("^[A-Za-z0-9_.-]+$")][string]$Owner,
        [Parameter(Mandatory = $true)][ValidatePattern("^[A-Za-z0-9_.-]+$")][string]$Repo,
        [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-fA-F]{40}$")][string]$PublishedSha,
        [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-fA-F]{40}$")][string]$ExpectedParentSha,
        [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$ExpectedVersion,
        [scriptblock]$InvokeCommand,
        [string[]]$RequiredChecks = @("build-test", "plugin-config", "static-analysis", "package-integrity")
    )

    if ($null -eq $InvokeCommand) {
        $InvokeCommand = {
            param([string]$Executable, [string[]]$Arguments, [AllowNull()][string]$InputText)
            Invoke-ReleaseVerificationNativeCommand $Executable $Arguments $InputText
        }
    }

    $PublishedSha = $PublishedSha.ToLowerInvariant()
    $ExpectedParentSha = $ExpectedParentSha.ToLowerInvariant()
    $evidence = [ordered]@{
        Success = $false
        Stage = "git-head"
        Error = $null
        PublishedSha = $PublishedSha
        ExpectedParentSha = $ExpectedParentSha
        ExpectedVersion = $ExpectedVersion
        Commands = [ordered]@{}
        Git = [ordered]@{}
        Protection = [ordered]@{}
        RequiredChecks = [ordered]@{}
        Clients = [ordered]@{}
    }

    try {
        $headOutput = Invoke-ReleaseVerificationCommand $InvokeCommand "git-head" "git" @("rev-parse", "HEAD") $null $evidence.Commands
        $head = $headOutput.Trim().ToLowerInvariant()
        if ($head -ne $PublishedSha) {
            throw "current Git HEAD $head does not match published SHA $PublishedSha"
        }
        $evidence.Git.Head = $head

        $evidence.Stage = "git-parent"
        $parentOutput = Invoke-ReleaseVerificationCommand $InvokeCommand "git-parent" "git" @("rev-parse", "HEAD^") $null $evidence.Commands
        $parent = $parentOutput.Trim().ToLowerInvariant()
        if ($parent -ne $ExpectedParentSha) {
            throw "published commit parent $parent does not match expected parent $ExpectedParentSha"
        }
        $evidence.Git.Parent = $parent

        $evidence.Stage = "git-remote"
        $remoteOutput = Invoke-ReleaseVerificationCommand $InvokeCommand "git-remote" "git" @("ls-remote", "origin", "refs/heads/master") $null $evidence.Commands
        $remoteHead = Get-ReleaseVerificationRemoteHead $remoteOutput
        if ($remoteHead -ne $PublishedSha) {
            throw "remote master $remoteHead does not match published SHA $PublishedSha"
        }
        $evidence.Git.RemoteHead = $remoteHead

        $evidence.Stage = "protection"
        $protectionEndpoint = "repos/$Owner/$Repo/branches/master/protection"
        $adminEndpoint = "$protectionEndpoint/enforce_admins"
        $protection = Get-ReleaseVerificationApiResponse $InvokeCommand "protection" $protectionEndpoint $evidence.Commands
        $evidence.Stage = "enforce-admins"
        $admin = Get-ReleaseVerificationApiResponse $InvokeCommand "enforce-admins" $adminEndpoint $evidence.Commands
        Test-ReleaseVerificationProtection $protection $admin $RequiredChecks
        $evidence.Protection = [ordered]@{
            Endpoint = $protectionEndpoint
            Status = $protection.Status
            AdminEndpoint = $adminEndpoint
            AdminStatus = $admin.Status
            AdminEnabled = $admin.Body.enabled
        }

        $evidence.Stage = "checks"
        $checksEndpoint = "repos/$Owner/$Repo/commits/$PublishedSha/check-runs?per_page=100"
        $checksResponse = Get-ReleaseVerificationApiResponse $InvokeCommand "required-checks" $checksEndpoint $evidence.Commands
        if ($checksResponse.Status -ne 200) {
            throw "required checks readback returned HTTP $($checksResponse.Status)"
        }
        Test-ReleaseVerificationChecks $checksResponse.Body $PublishedSha $RequiredChecks
        $evidence.RequiredChecks = [ordered]@{
            Endpoint = $checksEndpoint
            Status = $checksResponse.Status
            Names = @($RequiredChecks)
            Head = $PublishedSha
        }

        foreach ($client in @("codex", "claude")) {
            $inventoryName = "$client-inventory"
            $evidence.Stage = $inventoryName
            $inventory = Invoke-ReleaseVerificationCommand $InvokeCommand $inventoryName $client @("plugin", "list", "--json") $null $evidence.Commands
            $preflightName = "$client-preflight"
            $evidence.Stage = $preflightName
            $preflightPath = Join-Path $PSScriptRoot "preflight-installation.mjs"
            $preflightOutput = Invoke-ReleaseVerificationCommand $InvokeCommand $preflightName "node" @($preflightPath, $client) $inventory $evidence.Commands
            try {
                $preflight = $preflightOutput | ConvertFrom-Json
            } catch {
                throw "$client installation preflight returned malformed JSON"
            }
            Test-ReleaseVerificationClient $client $preflight $ExpectedVersion
            $evidence.Clients[$client] = [ordered]@{
                InventoryStatus = $evidence.Commands[$inventoryName].ExitCode
                PreflightStatus = $evidence.Commands[$preflightName].ExitCode
                Version = $preflight.version
                PluginIdentity = $preflight.pluginIdentity
                PluginRoot = $preflight.pluginRoot
                SkillPath = $preflight.skillPath
            }
        }

        $evidence.Stage = "complete"
        $evidence.Success = $true
    } catch {
        $evidence.Error = $_.Exception.Message
        $evidence.Success = $false
    }

    return [pscustomobject]$evidence
}
