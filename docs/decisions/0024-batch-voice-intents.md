# 0024. Batch Voice Intents With One-By-One Confirmation

- Status: Accepted
- Date: 2026-11-06

## Context

ADR 0023 made voice entry system-level, but one input still produced exactly one
record, and the model was told to keep only the largest amount when a sentence
mentioned several. Users paste whole bill rows or read out a morning of spending,
so collapsing a batch into one record silently loses money data. Typing a batch by
hand is exactly the tedium voice entry exists to remove.

## Decision

1. `voice.parseIntent` returns `intents: VoiceIntent[]` instead of a single intent.
   The system prompt answers with `{"intents":[...]}` and must emit one element per
   record, in source order, with an explicit ban on merging amounts or keeping only
   the largest.
2. `normalizeVoiceIntents` validates each item independently: malformed items are
   skipped and logged, order is preserved, and the batch is capped at
   `MAX_VOICE_INTENTS` (20) so a pasted dump cannot create an unbounded queue.
3. The capture sheet accepts pasted text and submits it as `transcript`, skipping
   ASR entirely. Both input paths share the same parse → queue tail.
4. A batch enters a renderer-side queue. The sheet reviews the head one record at a
   time (确认并填入 / 跳过 / 全部跳过); the top-bar voice button carries the pending
   count; reopening the sheet resumes where it stopped.
5. Confirming hands exactly one intent to its page. Closing a voice-prefilled form
   calls `deliverNextQueuedFor(domain)`, so the same-domain queue drains by saving
   one form after another. A single-record input keeps the old fast path.

## Rationale

An array plus a queue keeps every record visible and individually confirmable
without redesigning five page forms into one mega-form, and without writing to the
ledger from the model's output. Domain-scoped delivery still decides which page
owns a record, so a mixed batch (three expenses plus one balance update) drains in
the order the user spoke while each page only sees its own domain.

## Consequences

- Cache behaviour is unchanged: the system prompt grew by a few multi-record rules
  but stays a frozen prefix; ledger context still travels in the user turn.
- The queue lives in renderer memory; an app restart drops unconfirmed leftovers.
- Skipping is cheap: the user can drop one record or the whole rest of the batch.
- A pasted block longer than the cap keeps only the first 20 records; the model is
  instructed to say so in `warnings`.
