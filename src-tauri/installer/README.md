# Installer artwork and research data retention

`installer.nsi` is adapted from the [Tauri CLI 2.11.4 NSIS template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi), copyright Tauri Apps Contributors, under MIT / Apache-2.0. The upstream MIT license is included here.

Changes from upstream: replace the uninstall data-deletion checkbox with an English/Chinese explanation that research data is retained, and remove the recursive app-data deletion branch. Keep the remaining upstream install, maintenance, WebView2 and upgrade behavior. When upgrading Tauri CLI, review and rebase this template; do not silently return to the data-deleting default. No vault or research directory belongs to the installer.

`hooks.nsh` creates a start-menu uninstall shortcut and removes only a shortcut that still points to this installation. The standard Windows Installed Apps entry and `uninstall.exe` are supplied by NSIS. UI language follows the operating system.

`sidebar.bmp` and `header.bmp` are mechanical layout exports of the original owl artwork. Regenerate them on Windows with `powershell -NoProfile -File scripts/desktop-brand.ps1`. Regenerate ICO/ICNS with `npx tauri icon assets/brand/paper-owl-master.png`; copy the generated 128px PNG into `assets/brand/paper-owl.png` and `desktop-ui/paper-owl.png`.
