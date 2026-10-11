# Test-fixture helper. The default invocation is read-only.
# The owner runs -Create in an elevated Windows PowerShell window after review.
[CmdletBinding()]
param([switch]$Create)

$ErrorActionPreference = 'Stop'
$taskAccountName = 'OmeraUpdateQA'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
$taskIsAdmin = $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$taskExisting = Get-LocalUser -Name $taskAccountName -ErrorAction SilentlyContinue

Write-Output "Proposed disposable account: $taskAccountName"
Write-Output 'Membership: built-in Users only; expires three days after creation.'
Write-Output 'No existing account, installation, library or media will be removed.'
Write-Output 'The password is entered locally by the owner and is never saved by this helper.'
if (-not $Create) {
    Write-Output "Account already exists: $([bool]$taskExisting)"
    Write-Output "Current process elevated: $taskIsAdmin"
    Write-Output 'Read-only plan complete. No account was created.'
    return
}

if (-not $taskIsAdmin) { throw 'Account creation requires the owner to run this helper as administrator.' }
if ($taskExisting) { throw 'The account already exists. Refusing to reuse or modify it.' }
$taskUsersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
$taskCredential = Get-Credential -UserName $taskAccountName -Message 'Choose a password for the disposable Omera test account. Do not enter your normal account password.'
if (-not $taskCredential -or $taskCredential.UserName -ne $taskAccountName) {
    throw 'A credential for the exact disposable account is required.'
}

try {
    $taskNewUser = New-LocalUser -Name $taskAccountName -Password $taskCredential.Password `
        -AccountExpires (Get-Date).AddDays(3) -Description 'Disposable synthetic Omera update qualification'
    Add-LocalGroupMember -Group $taskUsersGroup -Member $taskNewUser
    Write-Output "Created $taskAccountName. No installer has been launched."
} finally {
    $taskCredential = $null
}
