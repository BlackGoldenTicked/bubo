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
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, Manager, Position, Size, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const QUICK_LABEL: &str = "quick-capture";

/// Physical position the app itself is about to apply; a `Moved` event matching it is not a drag.
static EXPECTED_MOVE: Mutex<Option<(i32, i32)>> = Mutex::new(None);
const DEFAULT_SHORTCUT: &str = "Control+Shift+V";
/// Last-resort combinations when the requested one is taken (or is an unbindable Fn chord).
const FALLBACK_SHORTCUTS: [&str; 3] = ["Alt+Shift+V", "Control+Alt+V", "Alt+Shift+B"];

/// macOS owns the Fn key: no Carbon hotkey can bind it, so a stored Fn chord is meaningless.
fn is_unbindable(shortcut: &str) -> bool {
    shortcut
        .split('+')
        .any(|token| token.trim().eq_ignore_ascii_case("fn"))
}

fn shortcut_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("voice-shortcut.json"))
}

pub fn requested_shortcut(app: &AppHandle) -> String {
    let stored = shortcut_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| value.get("shortcut").and_then(Value::as_str).map(str::to_string))
        .filter(|value| !value.trim().is_empty());

    match stored {
        // An earlier build shipped "Fn+P" as the default; it can never register, so treat it
        // as unset instead of reporting a fallback on every launch.
        Some(value) if !is_unbindable(&value) => value,
        _ => DEFAULT_SHORTCUT.to_string(),
    }
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

/// Where the status item actually sits, in logical top-left screen coordinates.
///
/// `TrayIcon::rect()` reads the status item's *window* frame, which macOS 26 reports as a
/// degenerate 68×0 rect at the origin, and AppKit cannot convert the button either (its window
/// is a stub owned by the menu bar). The value is only used when it looks like a real menu-bar
/// slot; otherwise positioning falls back to the menu-bar edge itself.
#[cfg(target_os = "macos")]
fn tray_screen_rect(app: &AppHandle) -> Option<(f64, f64, f64, f64)> {
    let tray = app.tray_by_id("bubo-tray")?;
    tray.with_inner_tray_icon(|inner| {
        let mtm = objc2::MainThreadMarker::new()?;
        let item = inner.ns_status_item()?;
        let button = item.button(mtm)?;
        let window = button.window()?;
        let rect = window.convertRectToScreen(button.frame());
        let screen = window.screen().or_else(|| objc2_app_kit::NSScreen::mainScreen(mtm))?;
        let screen_frame = screen.frame();
        let top = screen_frame.size.height - (rect.origin.y + rect.size.height);
        Some((rect.origin.x, top, rect.size.width, rect.size.height))
    })
    .ok()
    .flatten()
    .filter(|(x, y, width, height)| *width > 0.0 && *height > 0.0 && *x > 0.0 && *y < 80.0)
}

/// Screen size and menu-bar height, measured from the current screen.
#[cfg(target_os = "macos")]
fn menu_bar_metrics() -> Option<(f64, f64, f64)> {
    let mtm = objc2::MainThreadMarker::new()?;
    let screen = objc2_app_kit::NSScreen::mainScreen(mtm)?;
    let frame = screen.frame();
    let visible = screen.visibleFrame();
    let menu_bar = frame.size.height - (visible.origin.y + visible.size.height);
    Some((frame.size.width, frame.size.height, menu_bar.max(24.0)))
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

/// Logical bounds of the menu-bar icon, so the capture window hangs from the icon itself.
fn tray_bounds(app: &AppHandle, scale: f64) -> Option<(f64, f64, f64, f64)> {
    #[cfg(target_os = "macos")]
    if let Some(bounds) = tray_screen_rect(app) {
        return Some(bounds);
    }

    let rect = app.tray_by_id("bubo-tray")?.rect().ok().flatten()?;
    let (x, y) = match rect.position {
        Position::Physical(point) => (f64::from(point.x) / scale, f64::from(point.y) / scale),
        Position::Logical(point) => (point.x, point.y),
    };
    let (width, height) = match rect.size {
        Size::Physical(size) => (f64::from(size.width) / scale, f64::from(size.height) / scale),
        Size::Logical(size) => (size.width, size.height),
    };
    if width <= 0.0 || height <= 0.0 || y > 80.0 {
        return None;
    }
    Some((x, y, width, height))
}

fn quick_position_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("quick-window.json"))
}

/// Remember where the user dragged the popover, so it reopens in the same place.
fn saved_quick_position(app: &AppHandle) -> Option<(f64, f64)> {
    let raw = fs::read_to_string(quick_position_path(app)?).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    Some((value.get("x")?.as_f64()?, value.get("y")?.as_f64()?))
}

fn persist_quick_position(app: &AppHandle, x: f64, y: f64) {
    if let Some(path) = quick_position_path(app) {
        let _ = fs::write(path, json!({ "x": x, "y": y }).to_string());
    }
}

/// Screen bounds plus the menu-bar strip, in logical top-left coordinates.
fn screen_metrics(app: &AppHandle) -> (f64, f64, f64) {
    #[cfg(target_os = "macos")]
    if let Some(metrics) = menu_bar_metrics() {
        return metrics;
    }
    let monitor = app.primary_monitor().ok().flatten();
    match monitor {
        Some(monitor) => {
            let scale = monitor.scale_factor();
            let size = monitor.size().to_logical::<f64>(scale);
            (size.width, size.height, 24.0)
        }
        None => (1440.0, 900.0, 24.0),
    }
}

/// Place the capture window: the user's dragged position first, then just under the icon when
/// macOS reports it, and finally docked under the menu bar on the icon's side. It must never land
/// in a corner far from the menu bar, which is what a bogus tray rect used to cause.
fn quick_position(app: &AppHandle, width: f64, height: f64) -> LogicalPosition<f64> {
    let scale = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0);
    let (screen_width, screen_height, menu_bar) = screen_metrics(app);

    let max_x = screen_width - width - 8.0;
    let max_y = screen_height - height - 8.0;

    if let Some((saved_x, saved_y)) = saved_quick_position(app) {
        if saved_x > 0.0 && saved_y > menu_bar - 1.0 && saved_x < max_x && saved_y < max_y {
            eprintln!("[bubo] 语音窗口定位：上次位置 → ({saved_x:.0}, {saved_y:.0})");
            return LogicalPosition::new(saved_x, saved_y);
        }
    }

    if let Some((icon_x, icon_top, icon_width, icon_height)) = tray_bounds(app, scale) {
        let x = clamp(icon_x + icon_width / 2.0 - width / 2.0, 8.0, max_x);
        let y = clamp(icon_top + icon_height + 8.0, menu_bar + 6.0, max_y);
        eprintln!("[bubo] 语音窗口定位：菜单栏图标 → ({x:.0}, {y:.0})");
        return LogicalPosition::new(x, y);
    }

    // macOS 26 hides the status item frame: dock under the menu bar on its side of the screen.
    let x = clamp(max_x, 8.0, max_x);
    let y = clamp(menu_bar + 6.0, menu_bar + 6.0, max_y);
    eprintln!("[bubo] 语音窗口定位：菜单栏下方 → ({x:.0}, {y:.0})");
    LogicalPosition::new(x, y)
}

fn build_quick_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let width = 400.0;
    let height = 560.0;
    let position = quick_position(app, width, height);
    let window = WebviewWindowBuilder::new(
        app,
        QUICK_LABEL,
        WebviewUrl::App("index.html#/quick-capture".into()),
    )
    .title("bubo 语音录入")
    .inner_size(width, height)
    .position(position.x, position.y)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(true)
    .build()?;

    // Remember a dragged position, but ignore the moves this app performs itself.
    let handle = app.clone();
    let scale = window.scale_factor().unwrap_or(1.0);
    window.on_window_event(move |event| {
        let tauri::WindowEvent::Moved(position) = event else {
            return;
        };
        let current = (position.x, position.y);
        if let Ok(mut expected) = EXPECTED_MOVE.lock() {
            if let Some((x, y)) = *expected {
                if (current.0 - x).abs() <= 2 && (current.1 - y).abs() <= 2 {
                    *expected = None;
                    return;
                }
            }
        }
        persist_quick_position(&handle, f64::from(current.0) / scale, f64::from(current.1) / scale);
    });

    Ok(window)
}

pub fn open_quick_capture(app: &AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window(QUICK_LABEL) {
        Some(window) => window,
        None => build_quick_window(app).map_err(|error| format!("无法创建语音窗口：{error}"))?,
    };
    // Re-anchor on every open: the tray icon can move between displays.
    let position = quick_position(app, 400.0, 560.0);
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(mut expected) = EXPECTED_MOVE.lock() {
        *expected = Some((
            (position.x * scale).round() as i32,
            (position.y * scale).round() as i32,
        ));
    }
    let _ = window.set_position(position);
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
    eprintln!("[bubo] 语音快捷键已注册：{registered}（请求 {requested}）");
    Ok(registered)
}

/// Registers exactly one combination, without the startup fallback chain.
fn register_exact(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    manager
        .register(shortcut)
        .map_err(|error| format!("{shortcut}: {error}"))
}

/// Handler shared by the plugin. First press opens the window and starts recording; a press
/// while it is already on screen means "stop and parse", so the hotkey is a real toggle.
pub fn on_shortcut(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.emit("quick-capture:toggle", ());
            return;
        }
    }
    let _ = open_quick_capture(app);
}

pub fn shortcut_state(app: &AppHandle, registered: &str) -> Value {
    json!({
        "requested": requested_shortcut(app),
        "registered": registered,
        "defaultShortcut": DEFAULT_SHORTCUT,
    })
}

/// Re-registers a new shortcut and persists it only when the OS accepted that exact combination.
/// A rejected attempt restores the previous binding instead of leaving the app with none.
pub fn apply_shortcut(app: &AppHandle, shortcut: &str) -> Result<Value, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空".into());
    }
    if !trimmed.contains('+') {
        return Err("请按住 ⌘ / ⌃ / ⌥ / ⇧ 中的至少一个，再按一个键".into());
    }
    if is_unbindable(trimmed) {
        return Err("macOS 不允许把 Fn 注册为全局快捷键，请换一个组合".into());
    }

    let previous = requested_shortcut(app);
    match register_exact(app, trimmed) {
        Ok(()) => {
            persist_shortcut(app, trimmed)?;
            Ok(shortcut_state(app, trimmed))
        }
        Err(error) => {
            let _ = register_shortcut(app, &previous);
            Err(format!("{trimmed} 无法注册（{error}），已保留原来的快捷键"))
        }
    }
}

pub fn is_pressed(event: &tauri_plugin_global_shortcut::ShortcutEvent) -> bool {
    event.state() == ShortcutState::Pressed
}
