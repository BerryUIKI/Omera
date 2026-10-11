$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')

# Build metadata only: no runtime files are copied into the application/package.
$redistRoot = $env:VCToolsRedistDir
if (-not $redistRoot) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -ne 0 -or -not $installation) { throw 'Visual Studio C++ tools are required.' }
    $roots = @(Get-ChildItem -LiteralPath (Join-Path $installation 'VC\Redist\MSVC') -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending)
    if ($roots.Count -eq 0) { throw 'No CRT redistributable metadata found.' }
    $redistRoot = $roots[0].FullName
}
$crt = @(Get-ChildItem -LiteralPath (Join-Path $redistRoot 'x64') -Directory -Filter 'Microsoft.VC*.CRT')
if ($crt.Count -ne 1) { throw 'Expected exactly one x64 CRT directory.' }
$library = Join-Path $crt[0].FullName 'msvcp140.dll'
$signature = Get-AuthenticodeSignature -LiteralPath $library
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
    $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
    throw 'CRT metadata must come from a Microsoft-signed redistributable.'
}
(Get-Item -LiteralPath $library).VersionInfo.FileVersionRaw.ToString()
