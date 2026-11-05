# 0020. Voice Entry Through Local AI Providers

- Status: Accepted
- Date: 2026-11-04

## Context

bubo only accepted cashflow through imports or the manual entry form. A spoken
sentence is far faster than the form on a phone-sized thought, but it introduces
two remote models (speech recognition and semantic parsing) and long-lived
credentials into an app that otherwise stores everything locally.

Constraints that shaped the decision:

- The renderer must not hold API keys, and `window.bubo` exposes no filesystem.
- DashScope publishes no Node SDK; its docs route Node callers through the
  OpenAI-compatible endpoint with the OpenAI Node SDK.
- A misheard amount silently entering the ledger would violate the product's
  data-honesty stance.

## Decision

1. The whole AI pipeline runs in the private Node sidecar, exposed as one tRPC
   mutation `voice.parse`. The renderer sends base64 audio and receives a
   normalized draft only.
2. Bailian ASR (`qwen3-asr-flash`) and DeepSeek (`deepseek-chat`) both use the
   `openai` SDK with per-provider base URLs; audio travels inline as a data URI.
3. Model output is normalized by pure rules before it reaches the UI: invalid
   amounts become empty, categories must exist and match the flow kind, and
   future dates clamp to now.
4. Voice entry only prefills `AddTxModal`. Persisting goes through the existing
   manual `cashflow.create` path, so the user always confirms amount and
   category.
5. Credentials live in `bubo-voice.json` (mode `0600`) in the app-data
   directory, with `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` as env fallbacks. The
   renderer only sees a configured flag and a masked hint.

## Rationale

Keeping the calls behind the sidecar preserves the existing Tauri boundary: no
new Rust commands, no renderer network policy, no key in webview memory. A
single SDK for both providers keeps the sidecar dependency surface small.
Rejected alternatives: calling providers from the renderer (key exposure,
CSP/network variance), a built-in local ASR model (bundle size, no offline
requirement yet), and auto-saving parsed drafts (unacceptable silent ledger
writes).

## Consequences

- Voice entry requires network access and two API keys; without keys the modal
  still works as a plain form.
- Provider or model changes are settings edits, not code changes, because base
  URLs and model ids are stored alongside the keys.
- The sidecar bundle grows by roughly the size of the OpenAI SDK.
- Any future automatic posting from voice must go through a review step and a
  new decision record, not by relaxing these rules.
