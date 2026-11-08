/**
 * @purpose Bootstrap the Tauri shell and proxy narrow data commands to the Node sidecar.
 * @role    Rust composition root and private newline-delimited JSON process transport.
 * @deps    Tauri commands, serde_json, and the bundled bubo Node sidecar.
 * @gotcha  Sidecar stdout is a private line-delimited JSON protocol; stderr is diagnostic only.
 */
use serde_json::{json, Value};
use std::{
    fs,
    sync::{
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
};
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct SidecarProcess {
    child: Option<CommandChild>,
    messages: Receiver<Result<Value, String>>,
    next_id: u64,
}

impl SidecarProcess {
    fn start(app: &tauri::AppHandle) -> Result<Self, String> {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| format!("Failed to resolve bubo resource directory: {error}"))?;
        let migrations = resource_dir.join("migrations");
        let resources = resource_dir.join("resources");
        let user_data = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Failed to resolve bubo app data directory: {error}"))?;
        let native_cache = user_data.join("sidecar-native-cache");

        fs::create_dir_all(&user_data)
            .map_err(|error| format!("Failed to create bubo app data directory: {error}"))?;
        fs::create_dir_all(&native_cache)
            .map_err(|error| format!("Failed to create bubo sidecar cache directory: {error}"))?;

        for required_path in [&migrations, &resources] {
            if !required_path.exists() {
                return Err(format!(
                    "Missing bundled bubo resource: {}",
                    required_path.display()
                ));
            }
        }

        let command = app
            .shell()
            .sidecar("bubo-sidecar")
            .map_err(|error| format!("Failed to resolve bubo data sidecar: {error}"))?
            .current_dir(&resource_dir)
            .env("BUBO_SIDECAR_USER_DATA_DIR", &user_data)
            .env("BUBO_SIDECAR_MIGRATIONS_DIR", &migrations)
            .env("BUBO_SIDECAR_RESOURCES_DIR", &resources)
            .env("PKG_NATIVE_CACHE_PATH", &native_cache);
        let (mut events, child) = command
            .spawn()
            .map_err(|error| format!("Failed to start bubo data sidecar: {error}"))?;

        let (message_sender, messages) = mpsc::channel();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let value = serde_json::from_slice(&bytes).map_err(|error| {
                            format!("bubo data sidecar returned invalid JSON: {error}")
                        });
                        if message_sender.send(value).is_err() {
                            break;
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        eprintln!(
                            "[bubo-sidecar] {}",
                            String::from_utf8_lossy(&bytes).trim_end()
                        );
                    }
                    CommandEvent::Error(error) => {
                        let _ = message_sender.send(Err(format!(
                            "bubo data sidecar stream failed: {error}"
                        )));
                        break;
                    }
                    CommandEvent::Terminated(payload) => {
                        let _ = message_sender.send(Err(format!(
                            "bubo data sidecar exited unexpectedly (code {:?})",
                            payload.code
                        )));
                        break;
                    }
                    _ => {}
                }
            }
        });

        let mut process = Self {
            child: Some(child),
            messages,
            next_id: 0,
        };

        let ready = process.read_message()?;
        if ready.get("kind").and_then(Value::as_str) != Some("ready") {
            let message = ready
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("bubo data sidecar did not report ready");
            return Err(message.to_string());
        }

        Ok(process)
    }

    fn read_message(&mut self) -> Result<Value, String> {
        self.messages
            .recv()
            .map_err(|_| "bubo data sidecar message channel closed".to_string())?
    }

    fn request(&mut self, action: &str, payload: Option<Value>) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let message = json!({ "id": id, "action": action, "payload": payload });
        let mut bytes = serde_json::to_vec(&message)
            .map_err(|error| format!("Failed encoding bubo sidecar request: {error}"))?;
        bytes.push(b'\n');
        self.child
            .as_mut()
            .ok_or_else(|| "bubo data sidecar is not running".to_string())?
            .write(&bytes)
            .map_err(|error| format!("Failed writing bubo data sidecar: {error}"))?;

        let response = self.read_message()?;
        if response.get("id").and_then(Value::as_u64) != Some(id) {
            return Err("bubo data sidecar response id did not match its request".to_string());
        }
        if response.get("ok").and_then(Value::as_bool) == Some(true) {
            return Ok(response.get("data").cloned().unwrap_or(Value::Null));
        }
        Err(response
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("bubo data sidecar request failed")
            .to_string())
    }
}

impl Drop for SidecarProcess {
    fn drop(&mut self) {
        if let Some(child) = self.child.take() {
            let _ = child.kill();
        }
    }
}

/// The combination the OS actually accepted (Fn+P falls back on macOS).
struct ShortcutState(std::sync::Mutex<String>);

#[tauri::command]
fn get_voice_shortcut(app: tauri::AppHandle, state: State<'_, ShortcutState>) -> Value {
    let registered = state.0.lock().map(|value| value.clone()).unwrap_or_default();
    shell::shortcut_state(&app, &registered)
}

#[tauri::command]
fn set_voice_shortcut(
    app: tauri::AppHandle,
    state: State<'_, ShortcutState>,
    shortcut: String,
) -> Result<Value, String> {
    let value = shell::apply_shortcut(&app, &shortcut)?;
    if let Ok(mut guard) = state.0.lock() {
        if let Some(registered) = value.get("registered").and_then(Value::as_str) {
            *guard = registered.to_string();
        }
    }
    Ok(value)
}

#[tauri::command]
fn open_voice_capture(app: tauri::AppHandle) -> Result<(), String> {
    shell::open_quick_capture(&app)
}

#[tauri::command]
fn hide_quick_capture(app: tauri::AppHandle) {
    shell::hide_quick_capture(&app);
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    shell::show_main(&app);
}

#[derive(Clone)]
struct SidecarState {
    process: Arc<Mutex<SidecarProcess>>,
}

impl SidecarState {
    async fn request(&self, action: &'static str, payload: Option<Value>) -> Result<Value, String> {
        let process = Arc::clone(&self.process);
        tauri::async_runtime::spawn_blocking(move || {
            process
                .lock()
                .map_err(|_| "bubo data sidecar lock was poisoned".to_string())?
                .request(action, payload)
        })
        .await
        .map_err(|error| format!("bubo sidecar task failed: {error}"))?
    }
}

#[tauri::command]
async fn trpc_request(state: State<'_, SidecarState>, request: Value) -> Result<Value, String> {
    state.request("trpc", Some(request)).await
}

#[tauri::command]
async fn get_database_path(state: State<'_, SidecarState>) -> Result<Option<String>, String> {
    let value = state.request("databasePath", None).await?;
    serde_json::from_value(value)
        .map_err(|error| format!("bubo sidecar returned an invalid database path: {error}"))
}

#[tauri::command]
async fn database_exists(state: State<'_, SidecarState>) -> Result<bool, String> {
    let value = state.request("databaseExists", None).await?;
    serde_json::from_value(value)
        .map_err(|error| format!("bubo sidecar returned an invalid database status: {error}"))
}

#[tauri::command]
async fn drain_ledger_changes(state: State<'_, SidecarState>) -> Result<Value, String> {
    state.request("drainLedgerChanges", None).await
}

#[tauri::command]
async fn import_ledger(state: State<'_, SidecarState>, path: String) -> Result<Value, String> {
    state
        .request("importLedger", Some(Value::String(path)))
        .await
}

#[tauri::command]
async fn ledger_path(state: State<'_, SidecarState>, id: String) -> Result<String, String> {
    let value = state.request("ledgerPath", Some(Value::String(id))).await?;
    serde_json::from_value(value)
        .map_err(|error| format!("bubo sidecar returned an invalid ledger path: {error}"))
}

mod shell;

#[cfg(target_os = "macos")]
mod speech;

#[tauri::command]
async fn speech_recognize(audio_base64: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    match tauri::async_runtime::spawn_blocking(move || speech::recognize_wav_base64(&audio_base64))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("bubo speech task failed: {error}")),
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = audio_base64;
        Err("系统语音识别仅在 macOS 上可用".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if shell::is_pressed(&event) {
                        shell::on_shortcut(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let process = SidecarProcess::start(app.handle())?;
            app.manage(SidecarState {
                process: Arc::new(Mutex::new(process)),
            });

            let handle = app.handle().clone();
            shell::setup_tray(&handle)?;
            // Debug hook: BUBO_OPEN_QUICK_CAPTURE=1 opens the capture window on launch so it can be
            // inspected (or screenshotted) without pressing the global shortcut.
            if std::env::var("BUBO_OPEN_QUICK_CAPTURE").ok().as_deref() == Some("1") {
                let _ = shell::open_quick_capture(&handle);
            }
            match shell::setup_shortcut(&handle) {
                Ok(registered) => {
                    app.manage(ShortcutState(Mutex::new(registered)));
                }
                Err(error) => {
                    eprintln!("[bubo] voice shortcut unavailable: {error}");
                    app.manage(ShortcutState(Mutex::new(String::new())));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing hides to the menu bar; 退出 from the tray is the only real exit.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            trpc_request,
            get_database_path,
            database_exists,
            drain_ledger_changes,
            import_ledger,
            ledger_path,
            speech_recognize,
            get_voice_shortcut,
            set_voice_shortcut,
            open_voice_capture,
            hide_quick_capture,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("failed to run bubo Tauri application");
}
