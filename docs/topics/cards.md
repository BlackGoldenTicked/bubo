# Card Wallet

The card wallet answers a question the rest of bubo never asked: **which cards do I actually
hold, and what do they look like?** It is identity data — a debit card is not a balance and a
credit card is not a liability until a statement exists — so cards never touch cashflow, asset
snapshots, or net worth (see [ADR 0026](../decisions/0026-cards-are-identity-not-balances.md)).

## Key Files

- `cards/CardsPage.tsx` - the card wallet route: bank-grouped list, detail pane, archive/restore, and scan upload. The route has **no page header** (no title strip, no totals, no toolbar button): the wallet list owns the only 添加卡片 action at its foot, and the route name comes from the top navigation. Rows are grouped into collapsible bank sections (heaviest bank first, then by name) and each row shows the front scan as its thumbnail, falling back to the card's colour. Its create/edit dialog uses the `@bubo/ui` Modal primitive (not HeroUI's raw one, whose overlay renders in flow and lands off-screen); the form can pick 正面/反面 scans before the card exists, and the page imports them right after the row is written.
- `cards/CardVisual.tsx` - renders one flippable card surface; the detail card carries the `--gilt` gold hairline (see [ui](../modules/ui/)), while pile faces stay plain so the stack keeps reading as paper. `cardFaceBackground` / `CardFacePlaceholder` are exported from it so a pile face and the detail face cannot drift.
- `cards/CardStackList.tsx`, `cards/CardFormModal.tsx`, `cards/useCardScan.ts` - the image-first piles, the identity-only form (620px wide, every select names its own placeholder such as `月份` / `年份` / `选择卡组织`), and the per-face scan query both views share.
- `lib/desktop-runtime.ts` - intercepts `cards.attachImage` to open the native image dialog (PNG/JPG/WebP) and forwards only the chosen path — unless the caller already picked one. `pickCardImage` exposes the same picker plus a preview from the Rust `read_image_preview` command, which the card form uses.
- `apps/desktop/src/main/trpc/card-service.ts` - runtime-neutral card service contract for the router.
- `apps/desktop/src/tauri-sidecar/card-service.ts` - copies a picked scan, persists its metadata, and removes the copy if the row write fails.
- `apps/desktop/src/tauri-sidecar/card-image-store.ts` - owns `<user data>/card-images`: extension allow-list (PNG/JPG/WebP), 20MB cap, generated file names, and data-URL reads.

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
- The wallet column has two views over the same bank groups, switched by 列表 / 卡片 and
  remembered per device (`bubo:cards:wallet-view`): the compact row list, and image-first piles
  where the selected card is the only fully visible face and the rest show a 24px strip above
  it. Pile order is derived from selection, never stored — clicking a strip selects that card,
  which brings it to the front.
- Pile cards are half the rail's width and only their top ~30% stays in focus: the face is drawn
  twice, sharp above the band and gaussian-blurred below it, so a wallet reads as crisp card tops
  over frosted colour. The stack springs into place with a per-depth delay (the "breath"), and
  hovering widens the strips from 24px to 34px.
- The card is **one** flippable surface: front and back sit on the same 3D plane and rotate on
  `[data-flipped]`. Click the card (or use 正面 / 反面) to flip; the flip is disabled when only
  one face exists and under `prefers-reduced-motion`.
- Without scans, each face still renders as a card: bank, name, brand, `•••• last4`, holder,
  expiry, and currency over a brand-tinted gradient (or the user's `colorHex`).
- Credit cards additionally show limit and 账单日 / 还款日; the form hides those fields for other
  types.
- The create/edit dialog is built on the app's own `@bubo/ui` `Modal` (fixed backdrop, portals
  itself, focus trap, Esc), not HeroUI's raw `Modal`. In this build the raw one renders its
  overlay in normal flow: appended after the 900px app root it landed below the viewport, so
  clicking 添加卡片 looked like nothing happened, and inside the page container it was clipped and
  off-centre. Measured after the fix: the 560px panel sits at the exact viewport centre
  (`dx = 0, dy = 0`) on the first click.

## Deliberate Gaps

- No account linking yet: a card is not attached to an asset account or a statement.
- No image processing yet. The pair-shaped model is what makes perspective correction, glare
  removal, and edge detection additive rather than a rewrite.
- Scans are not part of the SQLite backup; copying a ledger moves rows but not images.
