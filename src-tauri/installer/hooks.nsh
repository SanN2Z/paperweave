; Explicit start-menu entry alongside the OS Installed Apps uninstaller.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
  CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\Uninstall Paperweave.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  ; Remove only our shortcut, and only if it still points to this installation.
  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\Uninstall Paperweave.lnk" "$INSTDIR\uninstall.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\$AppStartMenuFolder\Uninstall Paperweave.lnk"
    RMDir "$SMPROGRAMS\$AppStartMenuFolder"
  ${EndIf}
!macroend
