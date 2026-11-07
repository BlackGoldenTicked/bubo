/**
 * @purpose Provide the desktop shell affordances: menu-bar tray, quick capture window, and the global capture shortcut.
 * @role    Native layer for "minimize to menu bar" and hands-free voice capture.
 * @deps    Tauri tray/menu/window APIs, the global-shortcut plugin, and a small JSON settings file.
 * @gotcha  Closing the main window must hide, not exit: the tray is what keeps the process alive, and
 *          "退出" is the only path that really quits. macOS reports the Fn key as a modifier that
 *          Carbon hotkeys cannot bind, so a requested "Fn+…" shortcut falls back to a registrable
 *          combination and the resolved value is reported back to the renderer instead of failing
 *          silently. The quick window is reused: showing it emits `quick-capture:start` so the page
 *          resets and re-arms the recorder instead of mounting fresh every time.
 */
use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const QUICK_LABEL: &str = "quick-capture";
const DEFAULT_SHORTCUT: &str = "Fn+P";
/// Order matters: the first combination the OS accepts wins when Fn is unavailable.
const FALLBACK_SHORTCUTS: [&str; 3] = ["Control+Shift+V", "Alt+Shift+V", "Control+Alt+V"];

fn shortcut_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("voice-shortcut.json"))
}

pub fn requested_shortcut(app: &AppHandle) -> String {
    shortcut_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| value.get("shortcut").and_then(Value::as_str).map(str::to_string))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string())
}

fn persist_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let path = shortcut_path(app).ok_or_else(|| "无法定位配置目录".to_string())?;
    let body = json!({ "shortcut": shortcut }).to_string();
    fs::write(path, body).map_err(|error| format!("保存快捷键失败：{error}"))
}

/// Registers `requested`, falling back to a registrable combination when the platform refuses it.
/// Returns the shortcut that is actually live.
pub fn register_shortcut(app: &AppHandle, requested: &str) -> Result<String, String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let mut candidates: Vec<String> = vec![requested.trim().to_string()];
    if requested.trim() != DEFAULT_SHORTCUT {
        candidates.push(DEFAULT_SHORTCUT.to_string());
    }
    candidates.extend(FALLBACK_SHORTCUTS.iter().map(|value| value.to_string()));

    let mut last_error = String::from("没有可用的快捷键组合");
    for candidate in candidates {
        if candidate.is_empty() {
            continue;
        }
        match manager.register(candidate.as_str()) {
            Ok(()) => return Ok(candidate),
            Err(error) => last_error = format!("{candidate}: {error}"),
        }
    }
    Err(last_error)
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) if window.is_focused().unwrap_or(false) => {
                let _ = window.hide();
            }
            Ok(true) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
            _ => show_main(app),
        }
    }
}

/// Top-right, just under the menu bar — the same corner the tray icon lives in.
fn quick_position(app: &AppHandle, width: f64, _height: f64) -> (f64, f64) {
    if let Ok(Some(monitor)) = app.get_webview_window("main").map_or_else(
        || app.primary_monitor(),
        |window| window.primary_monitor(),
    ) {
        let scale = monitor.scale_factor();
        let size = monitor.size().to_logical::<f64>(scale);
        let x = size.width - width - 16.0;
        let y: f64 = 36.0;
        return (x.max(0.0), y.max(0.0));
    }
    (960.0, 36.0)
}

fn build_quick_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let width = 400.0;
    let height = 560.0;
    let (x, y) = quick_position(app, width, height);
    WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App("index.html#/quick-capture".into()))
        .title("bubo 语音录入")
        .inner_size(width, height)
        .position(x, y)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .build()
}

pub fn open_quick_capture(app: &AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window(QUICK_LABEL) {
        Some(window) => window,
        None => build_quick_window(app).map_err(|error| format!("无法创建语音窗口：{error}"))?,
    };
    let (x, y) = quick_position(app, 400.0, 560.0);
    let _ = window.set_position(LogicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("quick-capture:start", ());
    Ok(())
}

pub fn hide_quick_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_LABEL) {
        let _ = window.hide();
    }
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
    let voice = MenuItem::with_id(app, "voice", "语音录入", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 bubo", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &voice, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-wallet.png"))?;

    TrayIconBuilder::with_id("bubo-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("bubo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "voice" => {
                let _ = open_quick_capture(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn setup_shortcut(app: &AppHandle) -> Result<String, String> {
    let requested = requested_shortcut(app);
    let registered = register_shortcut(app, &requested)?;
    Ok(registered)
}

/// Handler shared by the plugin: any registered combination opens the quick capture window.
pub fn on_shortcut(app: &AppHandle) {
    let _ = open_quick_capture(app);
}

pub fn shortcut_state(app: &AppHandle, registered: &str) -> Value {
    json!({
        "requested": requested_shortcut(app),
        "registered": registered,
        "defaultShortcut": DEFAULT_SHORTCUT,
    })
}

/// Re-registers a new shortcut and persists it only when the OS accepted the combination.
pub fn apply_shortcut(app: &AppHandle, shortcut: &str) -> Result<Value, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空".into());
    }
    let registered = register_shortcut(app, trimmed)?;
    if registered != trimmed {
        return Err(format!("{trimmed} 无法注册，请换一个组合"));
    }
    persist_shortcut(app, trimmed)?;
    Ok(shortcut_state(app, &registered))
}

pub fn is_pressed(event: &tauri_plugin_global_shortcut::ShortcutEvent) -> bool {
    event.state() == ShortcutState::Pressed
}
