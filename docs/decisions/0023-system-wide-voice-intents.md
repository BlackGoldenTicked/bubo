# 0023. System-Level Voice Entry Through Domain Intents

- Status: Accepted
- Date: 2026-11-05

## Context

ADR 0020/0021/0022 built voice entry as a cashflow-only feature living inside the
"记一笔" modal. Users describe far more than expenses out loud — a balance they
just checked, a trade they just placed, a subscription they just signed up for —
and every one of those is a separate page with its own form. Keeping voice inside
one page's modal means the feature is unreachable exactly where it would be most
useful, and each new domain would otherwise need its own prompt and its own
provider plumbing.

## Decision

1. Voice capture becomes global: one overlay (`VoiceCaptureSheet`) mounted in the
   root layout, opened from the top-bar 语音 button or ⌘⇧V, recording and
   transcribing as before.
2. The model returns a **typed intent** for exactly one of five domains —
   `cashflow`, `asset`, `investment`, `subscription`, `loan` — or `unknown`. The
   shape is a discriminated union in `@bubo/shared/contracts`.
3. The system prompt is a **frozen constant** containing the whole business
   taxonomy and every domain's parameters. All per-call data (time, currency,
   categories, accounts, loans, subscriptions, positions, the utterance) travels
   in the user turn as JSON, so the prompt prefix stays byte-identical and the
   provider's prefix cache keeps hitting.
4. Normalization runs per domain in `voice-intent-rules.ts`: amounts stay strings,
   ids are re-validated against the ledger context, enums are re-checked, and any
   unknown becomes `unknown` with a reason rather than a guess.
5. Delivery is a domain-scoped bus (`intentHandoff.ts`): an intent goes to a live
   listener of its own domain, or waits for the page about to mount. Each page
   maps its own domain onto its own modal state through `useVoiceIntent`.
6. Every page keeps its existing mutation. Voice prefills forms; the user still
   confirms. Nothing in this pipeline writes to the ledger.

## Rationale

A single prompt plus a typed union replaces five prompts and five pipelines while
keeping each domain's vocabulary explicit. Freezing the prompt is what makes
caching possible at all: interpolating category names per call would invalidate
the prefix on any ledger edit and pay full input price every time. The domain
bus keeps the capture UI decoupled from feature pages, so adding a sixth domain
is a contract variant, a prompt section, and one page hook — not a new flow.

## Consequences

- The system prompt is large (~1.5k tokens). It is paid once per cache window and
  then billed at the cached rate; cache hits are logged for observability.
- An utterance that mixes domains resolves to one primary intent and warns.
- `unknown` intents leave the sheet open with the reason instead of navigating.
- Loan/subscription/trade dates are not clamped to "now" (they are legitimately
  in the future), unlike cashflow timestamps.
- The context is capped per list (categories 80, accounts 60, loans 20,
  subscriptions 40, positions 60) to keep the user turn bounded; a very large
  ledger degrades to partial vocabulary rather than failing.
