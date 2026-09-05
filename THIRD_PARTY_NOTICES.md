# Third-party notices

The Windows installer template is adapted from Tauri CLI 2.11.4 (`crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`), copyright Tauri Apps Contributors, under the MIT license. The adaptation removes app-data deletion during uninstall. Source and license are in `src-tauri/installer/`; packaged license text is also retained in `paperweave/third-party/tauri-installer-LICENSE-MIT`.

Paperweave includes a JavaScript adaptation of the ARIS-Monitor scanner:

- Upstream: https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep
- Source: `aris-monitor/scanner.py`
- Revision: `e59008d7a42eea50a2797e55dd0d85bbbf6572f5`
- Copyright (c) 2026 wanshuiyin; MIT license in `third-party/aris-monitor-LICENSE`.
- Adaptation: `server/monitor.js`. Adds bounded registry reads, explicit source availability, project filtering, Windows path normalization, stale-evidence labels and unknown states instead of assuming completion when a transcript is absent. Replaces the Python/Tkinter presentation with Paperweave's React and native Tauri windows. No upstream focus script is executed.

The Windows desktop distribution bundles Node.js; its license is included under `paperweave/runtime/LICENSE`. Production JavaScript dependencies retain their license files in `paperweave/node_modules`. Bundled drawing asset licenses and provenance remain in `assets/templates` and the corresponding documentation.

Native Rust dependency versions, source links and original license/notice texts are collected from the locked Cargo metadata into `paperweave/third-party/RUST-NOTICES.txt` during Windows packaging.
