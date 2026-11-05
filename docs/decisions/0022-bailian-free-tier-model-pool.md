# 0022. Bailian Free-Tier Model Pool Before DeepSeek Fallback

- Status: Accepted
- Date: 2026-11-05

## Context

ADR 0020/0021 made DeepSeek the single reasoning provider. Bailian hosts many
models with free quotas of varying size and expiry, and the user maintains a
sheet tracking each model's remaining quota and validity window. Burning those
free quotas before paying DeepSeek is the cheaper strategy, but which model is
usable changes over time and cannot be hardcoded.

## Decision

1. The sidecar stores a local model pool in `bubo-voice.json` (`llmModels`):
   `{ model, quota, expiresAt }` rows imported from a user-maintained Excel
   sheet, managed (list / import / remove) in settings over tRPC
   `voice.models.*`.
2. The import path is zero-dependency: a minimal xlsx reader (`xlsx-reader.ts`,
   zip + OOXML slicing over Node zlib) plus a fuzzy column mapper
   (`llm-models-import.ts`). Unparsable rows are skipped and reported, never
   guessed.
3. Per utterance, reasoning attempts run in this order: active pool models
   sorted by soonest expiry then largest quota, then the configured DeepSeek
   model as the final floor. Any failed attempt (auth, quota, rate limit,
   non-JSON) logs to stderr and moves on; the pool shares the Bailian API key.
4. Expired rows remain visible in settings but are never attempted.

## Rationale

Soonest-expiry-first spends free quota before it lapses, which a pure
quota-descending order would waste. DeepSeek stays last as the reliability
floor so voice entry survives an empty or fully exhausted pool. Keeping the
pool in the existing settings file and the parser dependency-free avoids
widening the sidecar supply chain for a hand-made sheet format.

## Consequences

- Quota values are static sort hints; real consumption is only observable by
  re-importing an updated sheet.
- A pool model that rejects `response_format: json_object` fails per attempt
  and the chain moves on, so incompatible models cost latency but not
  correctness.
- The xlsx reader only understands plain OOXML sheets; encrypted or exotic
  workbooks fail with an explicit error and can be re-saved from Excel/WPS.
