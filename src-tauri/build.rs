fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "launch_default", "open_project", "open_monitor", "pin_monitor",
                "collapse_monitor", "hide_window", "show_workbench", "quit_app",
            ]),
        ),
    ).expect("failed to build desktop command permissions");
}
