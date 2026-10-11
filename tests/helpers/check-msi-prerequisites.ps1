param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][ValidateSet(0, 1)][int]$ExpectedMissing)
$ErrorActionPreference = 'Stop'
$wix = Join-Path $env:LOCALAPPDATA 'tauri\WixTools314'
Add-Type -Path (Join-Path $wix 'sdk\Microsoft.Deployment.WindowsInstaller.dll')
[Microsoft.Deployment.WindowsInstaller.Installer]::SetInternalUI(
    [Microsoft.Deployment.WindowsInstaller.InstallUIOptions]::Silent) | Out-Null
# Safe sessions cannot change machine state. Execute searches only, never install.
$session = [Microsoft.Deployment.WindowsInstaller.Installer]::OpenPackage($Package, $true)
try {
    $session.DoAction('AppSearch')
    $query = 'SELECT `Condition` FROM `InstallExecuteSequence` WHERE `Action` = ''OmeraRuntimeMissing'''
    $condition = $session.Database.ExecuteStringQuery($query)[0]
    if ($session.EvaluateCondition($condition) -ne [bool]$ExpectedMissing) {
        throw "Unexpected runtime prerequisite result: $ExpectedMissing"
    }
    foreach ($table in @('InstallUISequence', 'InstallExecuteSequence')) {
        $sequenceQuery = 'SELECT `Sequence` FROM `' + $table + '` WHERE `Action` = ''OmeraRuntimeMissing'''
        $sequence = [int]$session.Database.ExecuteStringQuery($sequenceQuery)[0]
        $searchQuery = 'SELECT `Sequence` FROM `' + $table + '` WHERE `Action` = ''AppSearch'''
        $searchSequence = [int]$session.Database.ExecuteStringQuery($searchQuery)[0]
        if ($sequence -le $searchSequence -or $sequence -ge 1400) {
            throw 'Runtime check must follow AppSearch and precede InstallValidate/InstallInitialize'
        }
    }
    $session['REMOVE'] = 'ALL'
    if ($session.EvaluateCondition($condition)) { throw 'Missing runtime must not block uninstall' }
    Write-Output 'MSI safe-session runtime search, action order and uninstall checks passed.'
} finally {
    $session.Close()
}
