# 0026. Cards Are Identity, Not Balances

- Status: Accepted
- Date: 2026-11-07

## Context

bubo tracked cashflow, present assets, and future obligations, but had nowhere to keep the
physical cards a person actually holds. A card is neither: it does not move money when it is
created, archived, or scanned, and one bank account can have several cards. Mixing cards into
`asset_items` would have made net worth depend on how many pieces of plastic someone owns.

Scans were the second question. A card has two faces, users photograph both, and every future
improvement (perspective correction, glare removal, brand detection) will hang off that pair.

## Decision

1. A new `cards` table holds identity data only: bank, name, type
   (debit/credit/prepaid/virtual/other), brand, last four digits, holder, currency, credit
   limit, billing and repayment days, expiry, a display colour, note, and status.
2. `card_images` stores at most one row per `(card_id, side)` with `side ∈ {front, back}`.
   Rows carry a generated file name, mime type, byte size, and optional pixel size — never
   bytes, never a user-supplied path.
3. Files live under `<user data>/card-images`, written by the sidecar only. The renderer opens
   the native dialog and sends a path; the sidecar validates the extension (PNG/JPG/WebP) and
   the 20MB cap, copies the file under a generated name, then writes the row. If the row write
   fails, the copy is deleted so no orphan scan remains.
4. The renderer receives scans as data URLs from `cards.image`. The query key includes the
   scan's `updatedAt`, so replacing a face refetches instead of serving the old image.
5. Front and back render as **one** card surface that flips on the Y axis, not as two panes.
6. Archiving keeps the card row and its scans. Nothing in the card domain writes cashflow,
   snapshots, or net worth.

## Rationale

Cards are reference data. Keeping them out of the asset layer preserves the asymmetric finance
model: a debit card is not a balance, and a credit card is not a liability until a statement is
tracked. Storing only metadata in SQLite keeps the database portable while scans stay on disk,
which is also what makes a later image-processing pipeline possible without a migration.

## Consequences

- A card cannot be used to reconcile an account. Linking a card to an asset account is a future
  feature, and if it happens the link must be explicit, not inferred.
- Scans are not backed up with the SQLite file; moving a ledger to another machine moves the
  rows but not the images.
- HEIC is rejected on purpose: WebKit and Chromium on Windows cannot render it.
- Only the last four digits are collected. Full numbers and CVVs are never requested, stored,
  or logged.
