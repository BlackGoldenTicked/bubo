# System-Level Voice Entry

## Purpose

Voice entry lets a user hold one thought out loud instead of typing a form:
"中午吃麻辣烫花了三十八块五", "招行卡里现在有八万", "买十股苹果每股一百八",
"新办了房贷月供五千八", "Netflix 每月六十". Each input — one sentence or a pasted
block — is decomposed into **one intent per record**, each mapped onto a business
domain (cashflow, asset, investment, subscription, or loan), and each **prefills its
page's own form** after the user confirms it in the capture sheet. Nothing is written
until the user saves.

This keeps the asymmetric finance model intact. Each page keeps its existing
mutation: cashflow still goes through `createCashflowEvent`, an asset value
still appends a snapshot, a loan still becomes a plan, a trade still replays
through the position. Voice only fills fields.

## Pipeline

```text
global capture sheet (top-bar 语音 button or ⌘⇧V)
  -> 16 kHz mono PCM WAV (base64)
  -> macOS? native `speech_recognize` command (Apple Speech, zh-CN)
       | failed / non-macOS / unbundled dev
       v
     tRPC `voice.transcribe` -> pooled Bailian ASR
  -> tRPC `voice.parseIntent` (transcript only; cloud ASR skipped)
  -> sidecar gathers ledger vocabulary (categories, accounts, loans,
     subscriptions, positions) and sends it as the user turn
  -> reason: static system prompt (cached prefix) + ledger JSON + utterance
  -> pool models in order, then DeepSeek as the final floor
  -> pure per-domain normalization (ids re-validated, amounts never guessed)
  -> VoiceIntent
  -> deliver to the matching page + navigate
  -> page opens its own create modal with the intended fields filled
  -> user confirms through that page's existing mutation
```

## Batch And Text Input

- **Text path**: the sheet carries a textarea. Submitting it sends `transcript`
  straight to `voice.parseIntent`, so ASR is skipped entirely (requirement: paste a
  bill or chat log and parse immediately). `⌘↵` submits.
- **Multi-record extraction**: the model answers with `{"intents":[...]}` and is
  instructed to emit one element per record — never to merge amounts or keep only the
  largest. `normalizeVoiceIntents` preserves source order, drops malformed items with
  a logged error, and caps the batch at `MAX_VOICE_INTENTS` (20).
- **One-by-one confirmation**: a batch is queued and the sheet reviews the head only
  ("第 1 / N 笔待确认") with 确认并填入 / 跳过 / 全部跳过. Confirming hands that one
  record to its page and keeps the rest queued; the top-bar 语音 button shows the
  pending count, and reopening the sheet resumes the queue.
- **Multi-date batches**: every record carries its own date. The prompt states that a
  standalone date line ("10月3日", "2026/10/03 周六", "昨天") is inherited by the detail
  lines below it until a new date line appears; a row with its own date wins. Only rows
  with no date in scope fall back to "now" (with a warning), and month/day-only values
  are resolved against the current year nearest to today.
- **Cross-domain batches**: records keep source order across domains. Confirming one
  hands only that record to its page; a mixed batch (three expenses plus a balance
  update plus a trade) drains domain by domain.
- **Auto-advance**: closing a voice-prefilled form calls `continueVoiceQueue(domain, wasVoicePrefilled)`.
  It first feeds the next record of the same domain into that page; when only other
  domains remain it reopens the sheet on the next review card instead of leaving it
  behind the top-bar badge. Hand-opened forms never advance the batch.
- A single-record input keeps the fast path: parse → deliver → navigate, no review step.

## Domains

| domain         | Page             | Prefilled fields                                                      |
| -------------- | ---------------- | --------------------------------------------------------------------- |
| `cashflow`     | `/imports`       | kind, amount, title, category, payment method, date, note             |
| `asset`        | `/assets`        | account name, asset type, value, currency, date, quantity/cost basis  |
| `investment`   | `/investments`   | symbol, name, instrument kind, side, quantity, price, fee, date       |
| `subscription` | `/subscriptions` | name, amount, cycle, interval, next charge date, auto renew, category |
| `loan`         | `/loans`         | name, lender, principal, monthly payment, rate, term, start date      |
| `unknown`      | —                | nothing opens; the sheet shows the reason and stays open for a retry  |

Routing rules that matter in practice: "月供/房贷/分期/还款" → loan;
"订阅/会员/每月自动扣" → subscription; "买入/卖出/几股/几份/成交价" → investment;
"余额/现在有/值多少/市值" → asset; everything else about money moving → cashflow.
The precedence lives in the frozen prompt, not in renderer heuristics.

## Prompt Caching

The system prompt is a single **frozen constant** (`VOICE_INTENT_SYSTEM_PROMPT`)
holding the domain taxonomy, every domain's field list, the multi-record rules, and
the hard rules. All
per-call data — current time, display currency, categories, accounts, loans,
subscriptions, positions, the utterance — goes into the **user turn as JSON**.

That split is deliberate: both DeepSeek and Bailian bill repeated prefixes at a
much lower rate (DeepSeek's context cache, Qwen's implicit prefix cache), and a
byte-identical prefix is what makes those hits happen. A prompt that interpolates
category names would miss the cache on every ledger edit.

Cache accounting is logged per call (`prompt` / `cached` token counts, read from
either `prompt_cache_hit_tokens` or `prompt_tokens_details.cached_tokens`) so the
hit rate is observable without instrumenting the providers.

## ASR Channels

| Channel                            | Runs where                              | Notes                                                                                                                                  |
| ---------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Speech (macOS, preferred)    | native command `speech_recognize`       | `SFSpeechURLRecognitionRequest` with `zh-CN`; on-device when `supportsOnDeviceRecognition`, Apple server mode otherwise (rate limited) |
| Bailian qwen3-asr-flash (fallback) | sidecar, over DashScope compatible-mode | used when system speech fails, is denied, or on non-macOS builds                                                                       |

Both channels converge on the same intent input: system speech sends
`transcript` and skips cloud ASR entirely, while the fallback path sends
`audioBase64` + `mimeType`. Any failure in the system path degrades silently to
Bailian, so the sheet never blocks on one provider.

## Model Pools

The sheet import populates **two consumed pools** with one shared rule set
(filter expired → soonest expiry first → larger quota first):

- **推理池（purpose=llm）**: consumed by the intent stage. Tries pool models over
  the Bailian compatible-mode endpoint, then DeepSeek as the final floor.
- **语音识别池（purpose=asr）**: consumed whenever macOS system speech is not used —
  i.e. on non-macOS builds, unbundled dev runs, or when system recognition fails.
  Tries the imported recognition models first, then the configured default
  qwen3-asr-flash.
- tts / livetranslate / vision / embedding rows are imported and listed for their
  own future consumers but no current stage reads them.

Purpose is inferred per row from the model id and 类型 column (`inferPoolPurpose`).
Both pools share the Bailian API key; a failed call (auth, quota, rate limit,
non-JSON for reasoning / empty text for ASR) logs to stderr and moves to the next
attempt, so one incompatible model costs latency but never the feature.

Pool reasoning requests send `enable_thinking: false`: Qwen reasoning models would
otherwise spend seconds on hidden thinking before emitting the JSON answer, which
the UI never shows anyway.

Recognition and intent parsing are two separate mutations (`voice.transcribe` then
`voice.parseIntent`) so the sheet can log each stage with its model name and
latency in a fixed-height, scrolling log area.

**Workbook format** (first sheet): a header row containing 模型 / 额度 /
剩余时间 columns (names matched fuzzily, e.g. 模型名、免费额度、到期日、有效期
also work). The expiry cell may be a calendar date, "剩余30天"-style day
counts, or an Excel date serial. The quota cell may be a plain number or
"剩 995.6K / 共 1M" text. Re-importing a model name updates its quota and
expiry; rows are listed in settings grouped by purpose where each can be
removed. Parsing is zero-dependency (`xlsx-reader.ts`); unparsable rows are
skipped, never guessed.

## UI Handoff

- `voice/VoiceCaptureSheet.tsx` is mounted in the root layout, opened from the
  top-bar 语音 button or ⌘⇧V, so capture works from any page.
- `lib/voice/intentHandoff.ts` is a domain-scoped bus: it delivers to a live
  listener of the same domain, otherwise queues the intent for the page that is
  about to mount. That is what makes "deliver → navigate → page mounts" work
  without the page you are leaving swallowing the intent.
- `lib/voice/useVoiceIntent.ts` is the one-line page hook: each page maps its own
  domain onto its own modal state (`TxForm`, `AssetForm`, `PositionForm`,
  `SubForm`, `LoanForm`).
- An `asset` intent with a matched account opens the **balance** mode of the asset
  modal (append a reading); an unmatched one opens **add account**. An
  `investment` intent with a matched holding opens the trade modal, otherwise the
  new-position modal.

## Cloud Provider Choices

| Stage     | Provider                          | Endpoint                                            | Default model     |
| --------- | --------------------------------- | --------------------------------------------------- | ----------------- |
| ASR       | Alibaba Cloud Bailian (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3-asr-flash` |
| Reasoning | DeepSeek                          | `https://api.deepseek.com`                          | `deepseek-chat`   |

DashScope ships no Node SDK: its own documentation points Node callers at the
OpenAI-compatible endpoint with the OpenAI Node SDK. Both providers therefore go
through `openai`, configured with per-provider base URLs, so there is one client
dependency instead of two bespoke HTTP wrappers.

Audio is sent inline as `data:audio/wav;base64,…` in an `input_audio` content
part, which avoids an OSS upload or a publicly reachable URL.

## Settings And Secrets

- `bubo-voice.json` lives in the app-data directory next to the ledgers and is
  written with mode `0600`.
- `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` environment variables act as a
  fallback when the file has no key, which keeps CLI and dev runs simple.
- `baseUrl` and `model` are stored per provider in the same file, so another
  Bailian region or a newer model id is a file edit, not a code change.
- The renderer only ever receives `configured` plus a masked `keyHint`; a blank
  key field in settings means "keep the stored key", so editing a model name
  cannot wipe credentials.

## Normalization Rules

The model output is untrusted input. `voice-intent-rules.ts` (all domains) and
`voice-entry-rules.ts` (cashflow details) enforce:

- Amounts, quantities, and prices are decimal strings with at most two fraction
  digits, taken only from the utterance. An unparsable value becomes `""` plus a
  warning; it is never guessed.
- Ids must exist in the ledger context sent with the request. A hallucinated
  category is dropped, a hallucinated asset id falls back to "new account", and a
  hallucinated position id falls back to "open position" — each with a warning.
- Enums (`assetType`, `instrumentKind`, `billingCycle`, `side`) are re-validated;
  unknown values degrade to `other` / `monthly` / `buy`.
- A cashflow timestamp later than "now" or before 2000 is clamped to now. Loan
  start dates, subscription charge dates, and trade dates are _not_ clamped
  because they are legitimately in the future.
- `warnings` surface in the sheet before navigation and stay visible in the
  prefilled form, so the user sees what the model was unsure about.

## Module Map

- `packages/shared/src/contracts/voice/voice.contract.ts` - renderer-safe contracts, intent union.
- `packages/api/src/domain/voice/voice-intent-rules.ts` - frozen system prompt, message builder, per-domain normalization.
- `packages/api/src/domain/voice/voice-entry-rules.ts` - cashflow draft normalization.
- `packages/api/src/domain/voice/llm-pool-rules.ts` - pool filtering, ordering, and attempt-chain rules.
- `packages/api/src/use-cases/voice/voice-intent-api.ts` - intent pipeline orchestration.
- `packages/api/src/use-cases/voice/voice-transcribe-api.ts` - ASR-only stage.
- `packages/api/src/infrastructure/ai/bailian-asr-client.ts` - cloud ASR call (fallback channel).
- `packages/api/src/infrastructure/ai/llm-entry-client.ts` - OpenAI-compatible JSON completion shared by pool models and DeepSeek.
- `packages/api/tests/voice-intent-rules.test.ts` - domain routing, id safety, cache-stable prompt tests.
- `apps/desktop/src-tauri/src/speech.rs` - Apple Speech bridge behind `speech_recognize`.
- `apps/desktop/src/tauri-sidecar/voice-settings-store.ts` - local credential and model-pool file.
- `apps/desktop/src/tauri-sidecar/voice-service.ts` - sidecar implementation; assembles ledger context.
- `apps/desktop/src/tauri-sidecar/xlsx-reader.ts` - zero-dependency first-sheet xlsx reader.
- `apps/desktop/src/tauri-sidecar/llm-models-import.ts` - workbook column mapping to pool entries.
- `apps/desktop/src/renderer/src/voice/VoiceCaptureSheet.tsx` - global capture overlay: recorder, batch textarea, and the one-by-one review card.
- `apps/desktop/src/renderer/src/lib/voice/audioRecorder.ts` - microphone to WAV.
- `apps/desktop/src/renderer/src/lib/voice/intentHandoff.ts` - domain-scoped intent bus plus the ordered confirmation queue.
- `apps/desktop/src/renderer/src/lib/voice/useVoiceIntent.ts` - per-page intent hook.

## Platform Notes

- macOS needs `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`;
  both live in `apps/desktop/src-tauri/Info.plist` and are merged into the bundle.
- Recording is capped at 60 seconds and encoded locally as 16 kHz mono PCM, so
  the IPC payload stays a few hundred kilobytes instead of megabytes.
- `tauri dev` runs an unbundled binary, so macOS may attribute the microphone
  prompt to the terminal instead of the app; packaged builds show `bubo`.
- Apple server-mode speech recognition is rate limited; heavy use on a system
  without the on-device model will fall back to Bailian until the quota clears.

## Limits

- One record per intent; a sentence mixing domains yields one intent per record, and
  the batch cap (20) applies per input.
- Currencies other than the ledger display currency rely on the model naming
  them explicitly in the utterance.
- System speech runs fully offline only when the on-device model exists;
  otherwise its server mode — like the Bailian fallback — is a remote call.
- Voice never edits or deletes: it only opens a create form. Editing stays manual.
