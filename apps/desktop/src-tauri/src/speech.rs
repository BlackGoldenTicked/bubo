/**
 * @purpose Recognize speech from renderer-recorded audio with Apple's Speech framework.
 * @role    macOS-only native bridge behind the narrow `speech_recognize` Tauri command.
 * @deps    objc2-speech bindings, base64 decoding, and the system speech authorization state.
 * @gotcha  On-device recognition is preferred when the system model exists; otherwise the request
 *          falls back to Apple's server mode, which is rate limited — the renderer then falls back
 *          to Bailian. All errors surface as Err so callers can degrade transparently.
 */

use base64::Engine as _;
use block2::RcBlock;
use objc2::AnyThread;
use objc2_foundation::{NSBundle, NSLocale, NSError, NSString, NSURL};
use objc2_speech::{
    SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus, SFSpeechRecognitionResult,
    SFSpeechURLRecognitionRequest,
};
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const RECOGNIZE_TIMEOUT: Duration = Duration::from_secs(90);
const LOCALE_IDENTIFIER: &str = "zh-CN";

/// TCC aborts the whole process when it cannot verify the usage description: unbundled,
/// unsigned binaries (plain `tauri dev`) are rejected even when `__TEXT,__info_plist` exists,
/// because tccd trusts only the code signature. System speech therefore requires a bundled,
/// described build; every other environment returns an error and the renderer falls back to
/// the Bailian cloud path.
fn system_speech_available() -> bool {
    let bundle = NSBundle::mainBundle();
    let bundle_path = bundle.bundlePath().to_string();
    if !bundle_path.ends_with(".app") {
        return false;
    }
    bundle
        .objectForInfoDictionaryKey(&NSString::from_str("NSSpeechRecognitionUsageDescription"))
        .is_some()
}

fn ensure_authorized() -> Result<(), String> {
    if !system_speech_available() {
        return Err("调试模式未打包，系统语音识别不可用，已改用云端识别".to_string());
    }
    unsafe {
        match SFSpeechRecognizer::authorizationStatus() {
            SFSpeechRecognizerAuthorizationStatus::Authorized => Ok(()),
            SFSpeechRecognizerAuthorizationStatus::NotDetermined => {
                let (sender, receiver) = mpsc::channel::<SFSpeechRecognizerAuthorizationStatus>();
                let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
                    let _ = sender.send(status);
                });
                SFSpeechRecognizer::requestAuthorization(&handler);
                match receiver.recv_timeout(RECOGNIZE_TIMEOUT) {
                    Ok(SFSpeechRecognizerAuthorizationStatus::Authorized) => Ok(()),
                    Ok(_) => Err("语音识别权限被拒绝，请在系统设置中允许 bubo 语音识别".to_string()),
                    Err(_) => Err("等待语音识别授权超时".to_string()),
                }
            }
            _ => Err("语音识别权限被拒绝，请在系统设置中允许 bubo 语音识别".to_string()),
        }
    }
}

pub fn recognize_wav_base64(audio_base64: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64.trim())
        .map_err(|_| "录音数据不是有效的 base64".to_string())?;
    if bytes.is_empty() {
        return Err("录音内容为空".to_string());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    let path = std::env::temp_dir().join(format!("bubo-speech-{timestamp}.wav"));
    std::fs::write(&path, &bytes).map_err(|error| format!("写入临时录音失败: {error}"))?;

    let result = recognize_wav_file(&path);
    let _ = std::fs::remove_file(&path);
    result
}

fn recognize_wav_file(path: &std::path::Path) -> Result<String, String> {
    ensure_authorized()?;

    unsafe {
        let locale = NSLocale::initWithLocaleIdentifier(
            NSLocale::alloc(),
            &NSString::from_str(LOCALE_IDENTIFIER),
        );
        let recognizer = SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale)
            .ok_or_else(|| "当前系统没有可用的中文语音识别器".to_string())?;
        if !recognizer.isAvailable() {
            return Err("系统语音识别服务暂不可用".to_string());
        }

        let url = NSURL::from_file_path(path).ok_or_else(|| "录音文件路径无效".to_string())?;
        let request =
            SFSpeechURLRecognitionRequest::initWithURL(SFSpeechURLRecognitionRequest::alloc(), &url);
        let on_device = recognizer.supportsOnDeviceRecognition();
        request.setShouldReportPartialResults(false);
        request.setRequiresOnDeviceRecognition(on_device);

        let (sender, receiver) = mpsc::channel::<Result<String, String>>();
        let handler = RcBlock::new(
            move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
                if !error.is_null() {
                    let error = &*error;
                    let _ = sender.send(Err(format!(
                        "系统识别失败（{}）",
                        error.localizedDescription().to_string()
                    )));
                    return;
                }
                if result.is_null() {
                    return;
                }
                let result = &*result;
                if result.isFinal() {
                    let text = result.bestTranscription().formattedString().to_string();
                    let _ = sender.send(Ok(text));
                }
            },
        );

        let task = recognizer.recognitionTaskWithRequest_resultHandler(&request, &handler);
        let outcome = receiver.recv_timeout(RECOGNIZE_TIMEOUT);
        task.cancel();

        match outcome {
            Ok(Ok(text)) if !text.trim().is_empty() => Ok(text),
            Ok(Ok(_)) => Err("系统识别没有返回文字".to_string()),
            Ok(Err(message)) => Err(message),
            Err(_) => Err("系统语音识别超时".to_string()),
        }
    }
}
