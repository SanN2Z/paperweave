; Explicit start-menu entry alongside the OS Installed Apps uninstaller.
!define SHANZI_MAINTENANCE_SOURCE "${__FILEDIR__}\..\..\scripts\desktop-maintenance.ps1"
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
  CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\卸载扇子.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
  ; Legacy shortcuts are removed only when their targets match this installation.
  !insertmacro IsShortcutTarget "$SMPROGRAMS\Paperweave.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\Paperweave.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\Paperweave.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$DESKTOP\Paperweave.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$SMPROGRAMS\Paperweave\Paperweave.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\Paperweave\Paperweave.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$SMPROGRAMS\Paperweave\Uninstall Paperweave.lnk" "$INSTDIR\uninstall.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\Paperweave\Uninstall Paperweave.lnk"
  ${EndIf}
  RMDir "$SMPROGRAMS\Paperweave"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  ; Remove only our shortcut, and only if it still points to this installation.
  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\卸载扇子.lnk" "$INSTDIR\uninstall.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\$AppStartMenuFolder\卸载扇子.lnk"
    RMDir "$SMPROGRAMS\$AppStartMenuFolder"
  ${EndIf}
!macroend

!macro ShanziPrepareRuntime scriptPath
  nsExec::ExecToStack '$\"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe$\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $\"${scriptPath}$\" -InstallDir $\"$INSTDIR$\" -Mode Check'
  Pop $0
  Pop $1
  ${If} $0 == 10
    ${If} ${Silent}
    ${OrIf} $PassiveMode == 1
      SetErrorLevel 10
      Quit
    ${EndIf}
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(shanziCloseSessions)" IDOK +3
      SetErrorLevel 1
      Quit
    nsExec::ExecToStack '$\"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe$\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $\"${scriptPath}$\" -InstallDir $\"$INSTDIR$\" -Mode Stop'
    Pop $0
    Pop $1
  ${EndIf}
  ${If} $0 != 0
    ${IfNot} ${Silent}
    ${AndIf} $PassiveMode != 1
      MessageBox MB_ICONEXCLAMATION "$(shanziMaintenanceFailed)"
    ${EndIf}
    SetErrorLevel 20
    Quit
  ${EndIf}
!macroend
