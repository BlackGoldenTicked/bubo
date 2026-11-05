# 0021. Prefer macOS System Speech Recognition

- Status: Accepted
- Date: 2026-11-05

## Context

ADR 0020 put the entire voice pipeline behind two cloud providers (Bailian ASR,
DeepSeek). Bailian is the only stage that must receive raw microphone audio, and
it is also the only stage with no local alternative — macOS ships a system
speech recognizer (`SFSpeechRecognizer`) with good zh-CN quality and an
on-device mode.

## Decision

1. On macOS, the renderer's recorded WAV goes to a new narrow command
   `speech_recognize`, which runs `SFSpeechURLRecognitionRequest` via
   `objc2-speech` bindings. On-device recognition is forced when
   `supportsOnDeviceRecognition` reports the system model; otherwise Apple's
   server mode is used.
2. System-speech results enter `voice.parse` as a `transcript` field and skip
   the Bailian call entirely; the DeepSeek reasoning stage is unchanged.
3. Any failure (authorization denied, unsupported locale, timeout, empty
   result, non-macOS build) degrades silently to the Bailian ASR path.
4. `Info.plist` gains `NSSpeechRecognitionUsageDescription` alongside the
   existing microphone description.

## Rationale

Local recognition keeps microphone audio on the machine, costs nothing, and
works offline when the on-device model is present — matching bubo's
local-first stance. Keeping Bailian as a transparent fallback preserves the
feature on Windows and on systems where Apple recognition is unavailable.
Rejected alternatives: replacing Bailian outright (breaks non-macOS and
on-device-less systems) and Web Speech API in the renderer (unreliable inside
WKWebView).

## Consequences

- The Rust surface grows by one module (`speech.rs`) and one command; Apple
  server-mode recognition is rate limited, after which the fallback engages.
- First use on macOS triggers a speech-recognition authorization prompt in
  addition to the microphone prompt.
- `zh-CN` is the only configured locale; changing it is a one-line edit in
  `speech.rs`.
