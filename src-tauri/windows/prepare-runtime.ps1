param(
    [string]$RedistDir,
    [string]$Destination = (Join-Path $PSScriptRoot 'runtime')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')

# Use Visual Studio's redistributable CRT, never a developer's System32 files.
if (-not $RedistDir) {
    $redistRoot = $env:VCToolsRedistDir
    if (-not $redistRoot) {
        $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
        $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($LASTEXITCODE -ne 0 -or -not $installation) { throw 'Visual Studio C++ redistributable tools are required.' }
        $roots = Get-ChildItem -LiteralPath (Join-Path $installation 'VC\Redist\MSVC') -Directory |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Name } -Descending
        if (-not $roots) { throw 'No Visual Studio CRT redistributable directory found.' }
        $redistRoot = @($roots)[0].FullName
    }
    $crt = @(Get-ChildItem -LiteralPath (Join-Path $redistRoot 'x64') -Directory -Filter 'Microsoft.VC*.CRT')
    if ($crt.Count -ne 1) { throw 'Expected exactly one x64 Visual Studio CRT directory.' }
    $RedistDir = $crt[0].FullName
}

$required = @('msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll',
    'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
foreach ($name in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $RedistDir $name) -PathType Leaf)) {
        throw "Missing required CRT library: $name"
    }
}
$libraries = @(Get-ChildItem -LiteralPath $RedistDir -File -Filter '*.dll')

# Validate the entire set before copying any file. Reject foreign architectures
# and altered/untrusted binaries even when an explicit source directory is used.
foreach ($library in $libraries) {
    $bytes = [IO.File]::ReadAllBytes($library.FullName)
    if ($bytes.Length -lt 64 -or [BitConverter]::ToUInt16($bytes, 0) -ne 0x5a4d) {
        throw "Invalid PE runtime library: $($library.Name)"
    }
    $pe = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($pe -lt 64 -or $pe -gt ($bytes.Length - 6) -or
        [BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550 -or
        [BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664) {
        throw "Runtime library is not Windows x64: $($library.Name)"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $library.FullName
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
        $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
        throw "Runtime library lacks a valid Microsoft signature: $($library.Name)"
    }
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
foreach ($library in $libraries) {
    Copy-Item -LiteralPath $library.FullName -Destination (Join-Path $Destination $library.Name) -Force
}
# Remove only obsolete generated DLLs from this explicit output directory.
foreach ($old in @(Get-ChildItem -LiteralPath $Destination -File -Filter '*.dll')) {
    if ($old.Name -notin $libraries.Name) { Remove-Item -LiteralPath $old.FullName }
}
Write-Output "Prepared $($libraries.Count) Microsoft-signed x64 CRT libraries for app-local deployment."
