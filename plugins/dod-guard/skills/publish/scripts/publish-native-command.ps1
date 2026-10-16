function ConvertTo-PublishNativeText {
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

# stderr must never terminate a run: under the caller's 'Stop' preference on PowerShell 5.1, a
# merged stderr line becomes a terminating ErrorRecord before $LASTEXITCODE is read, so the exit
# code alone judges success and stderr is returned separately as evidence.
function Invoke-PublishNativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowNull()][string]$InputText
    )

    $ErrorActionPreference = 'Continue'
    $output = @()
    $global:LASTEXITCODE = 0
    if ($null -eq $InputText) {
        $output = @(& $Executable @Arguments 2>&1)
    } else {
        $output = @($InputText | & $Executable @Arguments 2>&1)
    }
    $exitCode = [int]$global:LASTEXITCODE

    $stdoutItems = @()
    $stderrItems = @()
    foreach ($item in $output) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            $stderrItems += $item.ToString()
        } else {
            $stdoutItems += $item
        }
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output = ConvertTo-PublishNativeText $stdoutItems
        Stderr = ConvertTo-PublishNativeText $stderrItems
    }
}
