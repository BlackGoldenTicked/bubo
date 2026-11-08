# Card Wallet

The card wallet answers a question the rest of bubo never asked: **which cards do I actually
hold, and what do they look like?** It is identity data — a debit card is not a balance and a
credit card is not a liability until a statement exists — so cards never touch cashflow, asset
snapshots, or net worth (see [ADR 0026](../decisions/0026-cards-are-identity-not-balances.md)).

## Data Model

| Table         | Holds                                                                                                                    | Never holds                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `cards`       | name, bank, type, brand, last four, holder, currency, credit limit, billing/repayment days, expiry, colour, note, status | full card number, CVV, balance |
| `card_images` | one row per `(card_id, side)` with file name, mime, byte size, pixel size                                                | image bytes, user paths        |

Images live under `<user data>/card-images`, named `${cardId}-${side}.${ext}` by the sidecar.
The database only knows the file name, so the folder can move with the user data directory.

## Storage Rules

- **Renderer never touches disk.** `cards.attachImage` is intercepted by the desktop bridge,
  which opens the native image dialog and injects `filePath`. The sidecar validates the
  extension (PNG/JPG/WebP), enforces a 20MB cap, copies the file, then writes metadata.
  When the caller already holds a path (the create form picks scans before the card exists),
  the bridge skips the dialog and forwards it — one entry point, two callers.
- **Scans can be attached while creating.** The form offers 正面 / 反面 tiles backed by
  `window.bubo.pickCardImage`, which returns the path plus a preview data URL from the Rust
  command `read_image_preview`. The preview never touches SQLite; on save the card row is
  written first, then each picked face is imported, and a failed import keeps the dialog open
  with the reason instead of silently losing the scan.
- **Write order matters.** Copy first, persist second; if the row write fails the copy is
  deleted. Removing a face deletes the row first, then the file.
- **HEIC is rejected.** WebKit and Chromium on Windows cannot render it.
- **Display uses data URLs.** `cards.image` returns `data:<mime>;base64,…`; the renderer caches
  per `(cardId, side, updatedAt)` so replacing a scan invalidates naturally.

## Surface

- Route `/cards` is the last primary tab (卡片). Left: cards grouped by bank, with archived ones
  behind a toggle. Right: the selected card.
- The card is **one** flippable surface: front and back sit on the same 3D plane and rotate on
  `[data-flipped]`. Click the card (or use 正面 / 反面) to flip; the flip is disabled when only
  one face exists and under `prefers-reduced-motion`.
- Without scans, each face still renders as a card: bank, name, brand, `•••• last4`, holder,
  expiry, and currency over a brand-tinted gradient (or the user's `colorHex`).
- Credit cards additionally show limit and 账单日 / 还款日; the form hides those fields for other
  types.
- The create/edit dialog is portalled to `document.body` and opened on the next animation frame:
  inside the page's `overflow: hidden` container the overlay was clipped and painted only after
  another interaction, which read as "the first click on 添加卡片 does nothing".

## Deliberate Gaps

- No account linking yet: a card is not attached to an asset account or a statement.
- No image processing yet. The pair-shaped model is what makes perspective correction, glare
  removal, and edge detection additive rather than a rewrite.
- Scans are not part of the SQLite backup; copying a ledger moves rows but not images.
