#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, hash::{Hash, Hasher}, path::PathBuf, process::Command, sync::Mutex};
use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Service { origin: String, project: Option<String>, data_dir: String }
#[derive(Default)]
struct Desktop {
    services: Mutex<HashMap<String, Service>>,
    last: Mutex<String>,
    launch: Mutex<()>,
}
fn option(args: &[String], key: &str) -> Option<String> {
    args.iter().position(|s| s == key).and_then(|i| args.get(i + 1)).cloned()
}
fn label_for(data_dir: &str) -> String {
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    if cfg!(windows) { data_dir.to_lowercase().hash(&mut hash); }
    else { data_dir.hash(&mut hash); }
    format!("workbench-{:x}", hash.finish())
}
fn show(app: &tauri::AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus();
    }
}
fn show_last(app: &tauri::AppHandle) {
    let label = app.state::<Desktop>().last.lock().unwrap().clone();
    show(app, if label.is_empty() { "launcher" } else { &label });
}
fn node_path(path: PathBuf) -> PathBuf {
    // Windows shell APIs can return verbatim paths. Node's main-module resolver
    // needs an ordinary drive/UNC path even though CreateProcess accepts both.
    #[cfg(windows)] {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") { return PathBuf::from(format!(r"\\{}", rest)); }
        if let Some(rest) = text.strip_prefix(r"\\?\") { return PathBuf::from(rest); }
    }
    path
}
fn application_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf());
    }
    Ok(node_path(app.path().resource_dir().map_err(|e| e.to_string())?.join("paperweave")))
}
fn launch(app: &tauri::AppHandle, project: Option<String>, override_data: Option<String>) -> Result<(), String> {
    let remember = override_data.is_none();
    let desktop = app.state::<Desktop>();
    // Serialize launches: no duplicate service/window from double click or a second instance.
    let _guard = desktop.launch.lock().unwrap();
    let app_data = node_path(app.path().app_data_dir().map_err(|e| e.to_string())?);
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let data_dir = override_data.unwrap_or_else(|| app_data.join("workspace").to_string_lossy().into_owned());
    let root = application_root(app)?;
    let node = if cfg!(debug_assertions) { PathBuf::from("node") }
        else { root.join(if cfg!(windows) { "runtime/node.exe" } else { "runtime/node" }) };
    let mut command = Command::new(node);
    command.arg(root.join("scripts/desktop-service.js")).current_dir(&root);
    if let Some(ref project) = project { command.args(["--project", project]); }
    else { command.args(["--data-dir", &data_dir]); }
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let output = command.output().map_err(|e| format!("Unable to start the bundled service: {e}"))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).chars().take(1600).collect()); }
    let service: Service = serde_json::from_slice(&output.stdout).map_err(|e| format!("Invalid startup result: {e}"))?;
    let url: tauri::Url = service.origin.parse().map_err(|_| "Invalid service URL")?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") { return Err("Service must run on loopback".into()); }
    let label = label_for(&service.data_dir);
    if app.get_webview_window(&label).is_none() {
        let allowed_origin = service.origin.clone();
        let external = app.clone();
        let popup = app.clone();
        let title = service.project.as_ref().and_then(|s| std::path::Path::new(s).file_name()).map(|s| format!("{} — Paperweave", s.to_string_lossy())).unwrap_or("Paperweave".into());
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
            .title(title).inner_size(1440.0, 960.0).min_inner_size(1000.0, 680.0)
            // Keep OS controls until the loaded frontend confirms it has replacements.
            // Reusing an older research service must never strand a borderless window.
            .shadow(true)
            .initialization_script(if cfg!(windows) {
                "window.__PAPERWEAVE_DESKTOP__ = true; window.__PAPERWEAVE_CUSTOM_CHROME__ = true;"
            } else { "window.__PAPERWEAVE_DESKTOP__ = true;" })
            .disable_drag_drop_handler().enable_clipboard_access().center()
            .on_navigation(move |url| {
                if url.origin().ascii_serialization() == allowed_origin { return true; }
                if matches!(url.scheme(), "http" | "https") { let _ = external.opener().open_url(url.as_str(), None::<&str>); }
                false
            })
            .on_new_window(move |url, _| {
                if matches!(url.scheme(), "http" | "https") { let _ = popup.opener().open_url(url.as_str(), None::<&str>); }
                tauri::webview::NewWindowResponse::Deny
            })
            .build().map_err(|e| e.to_string())?;
        let keeper = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = keeper.hide(); }
        });
    }
    desktop.services.lock().unwrap().insert(label.clone(), service.clone());
    *desktop.last.lock().unwrap() = label.clone();
    // Portable app state contains paths only; never a runtime token.
    if remember { let _ = std::fs::write(app_data.join("last-project.json"), serde_json::to_vec(&service).unwrap()); }
    show(app, &label);
    if let Some(launcher) = app.get_webview_window("launcher") { let _ = launcher.hide(); }
    Ok(())
}
#[tauri::command]
async fn launch_default(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let args: Vec<String> = std::env::args().collect();
        let mut project = option(&args, "--project");
        let mut data = option(&args, "--data-dir");
        if project.is_none() && data.is_none() {
            let last = app.path().app_data_dir().map_err(|e| e.to_string())?.join("last-project.json");
            if let Ok(bytes) = std::fs::read(last) {
                if let Ok(service) = serde_json::from_slice::<Service>(&bytes) {
                    if service.project.as_ref().is_none_or(|p| std::path::Path::new(p).is_dir()) { project = service.project; data = Some(service.data_dir); }
                }
            }
        }
        launch(&app, project, data)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn open_project(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(folder) = app.dialog().file().set_title("打开研究目录").blocking_pick_folder() {
            let project = node_path(folder.into_path().map_err(|e| e.to_string())?);
            launch(&app, Some(project.to_string_lossy().into_owned()), None)?;
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
fn service_for(app: &tauri::AppHandle, label: &str) -> Result<(String, Service), String> {
    let main = label.replacen("monitor-", "workbench-", 1);
    app.state::<Desktop>().services.lock().unwrap().get(&main).cloned().map(|s| (main, s)).ok_or("Open a research workbench first".into())
}
fn monitor(app: &tauri::AppHandle, main: &str) -> Result<(), String> {
    let (_, service) = service_for(app, main)?;
    let label = main.replacen("workbench-", "monitor-", 1);
    if app.get_webview_window(&label).is_none() {
        let origin = service.origin.clone();
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(format!("{}/?monitor=1", service.origin).parse().unwrap()))
            .title("Paperweave · 会话监控").inner_size(370.0, 440.0).min_inner_size(330.0, 110.0)
            .initialization_script("window.__PAPERWEAVE_DESKTOP__ = true;")
            .always_on_top(true).skip_taskbar(false).on_navigation(move |url| url.origin().ascii_serialization() == origin)
            .build().map_err(|e| e.to_string())?;
        let keeper = window.clone();
        window.on_window_event(move |event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = keeper.hide(); } });
    }
    show(app, &label); Ok(())
}
#[tauri::command]
async fn open_monitor(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> { monitor(&app, window.label()) }
#[tauri::command]
fn pin_monitor(window: WebviewWindow, pinned: bool) -> Result<(), String> {
    if !window.label().starts_with("monitor-") { return Err("Monitor window required".into()); }
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}
#[tauri::command]
fn collapse_monitor(window: WebviewWindow, collapsed: bool) -> Result<(), String> {
    if !window.label().starts_with("monitor-") { return Err("Monitor window required".into()); }
    window.set_size(tauri::LogicalSize::new(370.0, if collapsed { 112.0 } else { 440.0 })).map_err(|e| e.to_string())
}
#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> { window.hide().map_err(|e| e.to_string()) }
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum WindowAction { Ready, State, Drag, Minimize, ToggleMaximize, Hide }
#[tauri::command]
fn window_action(window: WebviewWindow, action: WindowAction) -> Result<bool, String> {
    // Always address the calling workbench, never a caller-supplied window label.
    if !window.label().starts_with("workbench-") { return Err("Workbench window required".into()); }
    match action {
        WindowAction::Ready => {
            #[cfg(windows)]
            window.set_decorations(false).map_err(|e| e.to_string())?;
        },
        WindowAction::State => {},
        WindowAction::Drag => window.start_dragging().map_err(|e| e.to_string())?,
        WindowAction::Minimize => window.minimize().map_err(|e| e.to_string())?,
        WindowAction::ToggleMaximize => {
            if window.is_maximized().map_err(|e| e.to_string())? { window.unmaximize() }
            else { window.maximize() }.map_err(|e| e.to_string())?;
        },
        WindowAction::Hide => window.hide().map_err(|e| e.to_string())?,
    }
    window.is_maximized().map_err(|e| e.to_string())
}
#[tauri::command]
fn show_workbench(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> { let (main, _) = service_for(&app, window.label())?; show(&app, &main); Ok(()) }
fn quit(app: tauri::AppHandle) {
    let target = app.clone();
    app.dialog().message("退出将结束桌面窗口内的终端会话。外部 CLI 和本地 MCP 服务继续运行。只想收起窗口，请取消后点击窗口关闭按钮。")
        .title("退出 Paperweave？").buttons(MessageDialogButtons::OkCancelCustom("退出".into(), "取消".into()))
        .show(move |ok| { if ok { target.exit(0); } });
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) { quit(app); }
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if let Some(project) = option(&args, "--project") { let handle = app.clone(); std::thread::spawn(move || { if let Err(e) = launch(&handle, Some(project), None) { handle.dialog().message(e).show(|_| {}); } }); }
            else { show_last(app); }
        }))
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())
        .manage(Desktop::default())
        .invoke_handler(tauri::generate_handler![launch_default, open_project, open_monitor, pin_monitor, collapse_monitor, hide_window, window_action, show_workbench, quit_app])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "打开工作台", true, None::<&str>)?;
            let project = MenuItem::with_id(app, "project", "打开研究目录…", true, None::<&str>)?;
            let monitor_item = MenuItem::with_id(app, "monitor", "会话监控", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "quit", "退出…", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &project, &monitor_item, &exit])?;
            TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Paperweave · 研究工作台")
                .menu(&menu).show_menu_on_left_click(cfg!(target_os = "macos"))
                .on_tray_icon_event(|tray, event| { if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) { show_last(tray.app_handle()); } })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_last(app),
                    "quit" => quit(app.clone()),
                    "project" => { let app = app.clone(); tauri::async_runtime::spawn(async move { if let Err(e) = open_project(app.clone()).await { app.dialog().message(e).show(|_| {}); } }); },
                    "monitor" => { let app = app.clone(); std::thread::spawn(move || { let label = app.state::<Desktop>().last.lock().unwrap().clone(); if let Err(e) = monitor(&app, &label) { app.dialog().message(e).show(|_| {}); } }); },
                    _ => {}
                }).build(app)?;
            let launcher = WebviewWindowBuilder::new(app, "launcher", WebviewUrl::App("index.html".into())).title("Paperweave").inner_size(600.0, 430.0).center().build()?;
            let keeper = launcher.clone();
            launcher.on_window_event(move |event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = keeper.hide(); } });
            Ok(())
        })
        .build(tauri::generate_context!()).expect("Paperweave desktop initialization failed")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = &event { api.prevent_exit(); }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event { show_last(app); }
            #[cfg(not(target_os = "macos"))]
            let _ = app;
        });
}
