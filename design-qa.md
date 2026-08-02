# Mobile Cashbook Design QA

- Source visual truth: `/Users/kaipeitseng/Downloads/截圖 2026-08-02 晚上9.50.49.png`
- Implementation screenshot: `/Users/kaipeitseng/.codex/visualizations/2026/08/02/019fc18e-affe-7952-8254-752175e7acdb/mobile-cashbook-form-fixed.png`
- Viewport and normalization: source 1179 × 2556 at 3× density, normalized to 393 × 852 CSS px; implementation 393 × 852 at 1×.
- State: signed-in mobile cashbook with the new-entry form open for a TWD expense.

## Full-view comparison

- The original form used a tall rounded card, large vertical gaps, a late-positioned amount field and a distant save action. The revised form occupies the stable phone viewport, puts amount first, uses compact 48px controls and keeps the save action visible at the bottom.
- The existing black/green palette, monospace eyebrow, field borders and action color remain unchanged.

## Focused comparison

- Header: reduced to a compact sticky bar while retaining title and close action.
- Entry fields: 16px control text prevents iOS input zoom; the amount uses a 26px numeric treatment and appears first visually.
- Motion containment: viewport, body and sheet widths all measured 393px; horizontal scroll remained 0. The body locks while the sheet is open and restores after closing.
- Persistent action: the save button ended at y=830 in an 852px viewport and remained visible.

## Interaction and console checks

- Center `記一筆` opens the form.
- Closing the form restores `body` to static positioning, clears its temporary top offset and preserves a 393px document width.
- Overview fixture confirmed the authoritative property formula renders NT$5,660,900.
- The browser retained one syntax error from the first malformed local fixture load; after the fixture was corrected, the app rendered and completed the open/close and responsive checks without a new implementation error.

## Comparison history

- P1: form was visually oversized and required excessive scrolling. Fixed with full-height mobile presentation, compact spacing and amount-first ordering.
- P1: page could pan or rubber-band horizontally while the sheet was open. Fixed with width containment, horizontal overscroll suppression, vertical-only touch action and fixed-body scroll locking.
- P2: iOS could zoom smaller form controls. Fixed by using 16px input and select text on mobile.

## Residual polish

- Native select and date icons remain platform-owned and intentionally vary slightly between iOS and the in-app browser.

final result: passed
