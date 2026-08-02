# Mobile Industry Exposure Design QA

- Source visual truth: `/var/folders/k5/3xk21tr921bgrzkbtdmyr1sm0000gn/T/codex-clipboard-6130c44f-68c3-487f-bbd1-9f77b67fb197.png`
- Implementation screenshot: `/Users/kaipeitseng/.codex/visualizations/2026/08/02/019fc18e-affe-7952-8254-752175e7acdb/mobile-industry-exposure.png`
- Viewport and normalization: desktop source 2048 × 1152; implementation 393 CSS px wide at 1× density. Desktop's wide chart-and-table composition is intentionally reflowed into a vertical phone reading order.
- State: main-industry mode with cash selected and four currency members visible.

## Full-view comparison

- The mobile section preserves the desktop hierarchy: `INDUSTRY EXPOSURE`, title, main-industry/sub-theme switch, selected category, ranked category list and selected-category members.
- The desktop donut is replaced by a compact selected-category percentage header and ranked list; this retains the decision information without shrinking a chart below a useful touch size.
- The existing black/green palette, mono numeric typography, semantic category colors and bordered table treatment are retained.

## Focused comparison

- Typography: category labels, TWD values and percentages remain readable at 393px without horizontal clipping.
- Layout: the section measured 361px, category rows 321px and document width exactly 393px; no horizontal overflow occurred.
- Color: the same green-led categorical palette is used for the ranked list, with the active category receiving a green-tinted background.
- Assets: the source contains only a data visualization and interface elements; no raster image assets were required.
- Copy: main labels, the long cash category name, currency member names and percentage semantics match the desktop source.

## Interaction and console checks

- Main-industry/sub-theme control was clicked in the browser and changed active state correctly.
- Category rows are wired to update the selected category and member detail through the production event path.
- Browser console reported no errors in the verified fixture.

## Comparison history

- P1: the first mobile capture overflowed because the desktop-style title and toggle shared one row. Reflowed the header to a vertical layout and constrained all rows to the card width.
- P2: long cash labels could push percentages off-screen. Converted selection and detail headers to shrinkable grids and allowed the selected label to wrap.
- Post-fix evidence confirms 393px document width, 361px card width and complete visibility of the cash currency breakdown.

## Residual polish

- The donut is intentionally omitted on phones; the ranked list communicates exact values more legibly and remains directly selectable.

final result: passed
