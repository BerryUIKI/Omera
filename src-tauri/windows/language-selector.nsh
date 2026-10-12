; Keep Tauri's language selector interactive only for manual installation.
; NSIS initializes $LANGUAGE from Windows and falls back to the first language.
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macroundef MUI_LANGDLL_DISPLAY
!macro MUI_LANGDLL_DISPLAY
  !insertmacro MUI_LANGDLL_VARIABLES
  !insertmacro MUI_DEFAULT MUI_LANGDLL_WINDOWTITLE "$(Omera_languageTitle)"
  !insertmacro MUI_DEFAULT MUI_LANGDLL_INFO "$(Omera_languagePrompt)"

  Push $0
  ClearErrors
  ${GetOptions} $CMDLINE "/P" $0
  ${IfNot} ${Errors}
  ${OrIf} ${Silent}
    !ifdef MUI_LANGDLL_REGISTRY_ROOT & MUI_LANGDLL_REGISTRY_KEY & MUI_LANGDLL_REGISTRY_VALUENAME
      ReadRegStr $mui.LangDLL.RegistryLanguage "${MUI_LANGDLL_REGISTRY_ROOT}" "${MUI_LANGDLL_REGISTRY_KEY}" "${MUI_LANGDLL_REGISTRY_VALUENAME}"
      ${If} $mui.LangDLL.RegistryLanguage != ""
        StrCpy $LANGUAGE $mui.LangDLL.RegistryLanguage
      ${EndIf}
    !endif
  ${Else}
    !ifdef MUI_LANGDLL_ALLLANGUAGES
      LangDLL::LangDialog "${MUI_LANGDLL_WINDOWTITLE}" "${MUI_LANGDLL_INFO}" A ${MUI_LANGDLL_LANGUAGES} ""
    !else
      LangDLL::LangDialog "${MUI_LANGDLL_WINDOWTITLE}" "${MUI_LANGDLL_INFO}" AC ${MUI_LANGDLL_LANGUAGES_CP} ""
    !endif
    Pop $LANGUAGE
    ${If} $LANGUAGE == "cancel"
      Pop $0
      Abort
    ${EndIf}
  ${EndIf}
  ClearErrors
  Pop $0
!macroend
