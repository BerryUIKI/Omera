!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "x64.nsh"
!include "${__FILEDIR__}\generated\prerequisites.nsh"

Var OmeraRuntimeReady
Var OmeraRuntimeDetails
Var OmeraRuntimeFile
Var OmeraRuntimeVersion
Var OmeraRuntimeDialog
Var OmeraRuntimeLink

!macro OmeraCheckRuntimeDll NAME
  ClearErrors
  ${GetFileVersion} "$SYSDIR\${NAME}" $0
  StrCpy $OmeraRuntimeFile "${NAME}"
  ${If} ${Errors}
    StrCpy $OmeraRuntimeDetails "$(Omera_runtimeFileMissing)"
    Goto omera_runtime_files_missing
  ${EndIf}
  ${VersionCompare} $0 "${OMERA_MINIMUM_CRT_VERSION}" $1
  ${If} $1 == 2
    StrCpy $OmeraRuntimeVersion $0
    StrCpy $OmeraRuntimeDetails "$(Omera_runtimeOutdated)"
    Goto omera_runtime_files_missing
  ${EndIf}
!macroend

Function OmeraCheckRuntime
  Push $0
  Push $1
  StrCpy $OmeraRuntimeReady 0
  StrCpy $OmeraRuntimeFile ""
  StrCpy $OmeraRuntimeVersion ""
  StrCpy $OmeraRuntimeDetails "$(Omera_runtimeNotInstalled)"
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    ; Some redistributables register the x64 runtime in the 32-bit view.
    SetRegView 32
    ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
    SetRegView 64
    ${If} $0 != 1
      Goto omera_runtime_done
    ${EndIf}
  ${EndIf}
  ; NSIS is 32-bit: inspect native System32, not redirected SysWOW64.
  ${DisableX64FSRedirection}
  !insertmacro OmeraCheckRuntimeDll "msvcp140.dll"
  !insertmacro OmeraCheckRuntimeDll "msvcp140_1.dll"
  !insertmacro OmeraCheckRuntimeDll "msvcp140_2.dll"
  !insertmacro OmeraCheckRuntimeDll "msvcp140_atomic_wait.dll"
  !insertmacro OmeraCheckRuntimeDll "msvcp140_codecvt_ids.dll"
  !insertmacro OmeraCheckRuntimeDll "vcruntime140.dll"
  !insertmacro OmeraCheckRuntimeDll "vcruntime140_1.dll"
  StrCpy $OmeraRuntimeReady 1
  StrCpy $OmeraRuntimeDetails ""
  omera_runtime_files_missing:
  ${EnableX64FSRedirection}
  omera_runtime_done:
  Pop $1
  Pop $0
FunctionEnd

; Declared before Tauri's pages and sections so even silent/passive upgrades
; fail before an existing application's uninstaller can run.
Page custom OmeraRuntimePage OmeraRuntimeLeave
Section "-Omera runtime prerequisites"
  Call OmeraCheckRuntime
  ${If} $OmeraRuntimeReady != 1
    DetailPrint "$(Omera_runtimeSilent)"
    DetailPrint "$OmeraRuntimeDetails"
    DetailPrint "$(Omera_runtimeMinimum)"
    IfSilent omera_runtime_stop
    ClearErrors
    ${GetOptions} $CMDLINE "/P" $0
    ${IfNot} ${Errors}
      Goto omera_runtime_stop
    ${EndIf}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$OmeraRuntimeDetails$\r$\n$\r$\n$(Omera_runtimeMinimum)$\r$\n$\r$\n$(Omera_runtimeMissing)"
    omera_runtime_stop:
    SetErrorLevel 1603
    Quit
  ${EndIf}
SectionEnd

Function OmeraRuntimePage
  Call OmeraCheckRuntime
  ClearErrors
  ${GetOptions} $CMDLINE "/P" $0
  ${IfNot} ${Errors}
    ; Tauri can uninstall from its later passive reinstall page, before sections.
    ${If} $OmeraRuntimeReady != 1
      SetErrorLevel 1603
      Quit
    ${EndIf}
    Abort
  ${EndIf}
  ${If} $OmeraRuntimeReady == 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "$(Omera_runtimeTitle)" ""
  nsDialogs::Create 1018
  Pop $OmeraRuntimeDialog
  ${If} $OmeraRuntimeDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 50u "$(Omera_runtimeHelp)"
  Pop $0
  ${NSD_CreateLabel} 0 55u 100% 45u "$OmeraRuntimeDetails"
  Pop $0
  ${NSD_CreateLabel} 0 105u 100% 20u "$(Omera_runtimeMinimum)"
  Pop $0
  ${NSD_CreateLink} 0 130u 100% 20u "$(Omera_runtimeDownload)"
  Pop $OmeraRuntimeLink
  ${NSD_OnClick} $OmeraRuntimeLink OmeraRuntimeDownload
  nsDialogs::Show
FunctionEnd

Function OmeraRuntimeDownload
  Pop $0
  ExecShell "open" "${OMERA_CRT_DOWNLOAD_URL}"
FunctionEnd

Function OmeraRuntimeLeave
  Call OmeraCheckRuntime
  ${If} $OmeraRuntimeReady != 1
    MessageBox MB_OK|MB_ICONEXCLAMATION "$OmeraRuntimeDetails$\r$\n$\r$\n$(Omera_runtimeMinimum)$\r$\n$\r$\n$(Omera_runtimeMissing)"
    Abort
  ${EndIf}
FunctionEnd
