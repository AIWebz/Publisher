; Folio Publisher — extra NSIS steps (electron-builder "nsis.include").
; After installing, the app makes a serial number for this computer and saves it on the user's desktop.
!macro customInstall
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --write-serial "$DESKTOP\Folio Publisher serial number.txt"'
!macroend
