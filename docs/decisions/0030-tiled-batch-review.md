# 0030. Tiled Batch Review With One-Click Save

- Status: Accepted
- Date: 2026-11-18

## Context

[ADR 0024](0024-batch-voice-intents.md) made one utterance produce several records and
put them in a queue, but the sheet then reviewed only the head record: 确认并填入 → that
record's own page form → save → next record. A pasted bill of ten lines therefore cost
ten confirmations plus ten form saves, and there was no moment where the user could see
the whole batch at once — which is exactly when a misparse (wrong amount, wrong category,
duplicated row) is cheapest to catch.

## Decision

1. A batch of two or more records opens a **tiled review window**: the capture sheet
   widens to 900px and renders every pending record as its own card, two per row, all
   expanded. The queue and its ordering rules from 0024 are unchanged.
2. Cashflow cards are edited in place — 项目 / 金额 / 日期 / 来源 / 分类 / 备注 — and
   `保存全部` persists every included card in one action through `cashflow.create`, the
   same mutation the 记一笔 form uses.
3. Only cashflow cards save straight from the window. Loans, subscriptions, assets, and
   trades have multi-field forms of their own, so those cards stay out of "save all" and
   keep a per-card 填入表单 that hands the record to its page (0024's delivery path).
4. Saved intents leave the queue before the window closes, so the top-bar badge only
   ever counts records that do not exist yet. A failed card stays in the window with its
   error and can be retried.
5. A single record keeps 0024's fast path: deliver → navigate → page form. There is no
   batch window for one card.

## Rationale

Reviewing is a scanning task, not a sequential one: seeing ten cards side by side costs
one glance, while ten modal round-trips cost attention on every transition. Editing stays
inline because the model's amounts and categories are the fields most likely to be wrong.
Restricting one-click save to cashflow keeps the boundary that each domain's form owns its
own validation — a loan needs principal, term, and payment day that no card should invent.

## Consequences

- The batch path now writes to the ledger directly instead of only prefilling a form. The
  window is still a review surface: nothing is written without an explicit 保存全部, and
  every card shows its warnings before that click.
- Per-card edits live in renderer state (`voice/batchDrafts.ts` drafts); closing the app
  still drops them, exactly as the queue already did.
- `AddTxModal` remains the manual and single-record entry; its "fall back to the first
  chip" effect is untouched by this change.
