# Mobile Cashbook Design QA

- Viewports checked: 390 × 844 and narrow layout rules at 380px.
- Visual sources: `IMG_2199.PNG` for the edge-to-edge calendar, records and bottom navigation; `IMG_2200.jpg` for the vertically grouped account list. The product's existing green-on-black palette and typography remain authoritative.
- Core journey checked: open 日常, switch between 帳本／帳戶, select a date, select the same date again, and open the center 記一筆 action. Existing USD/USDC rate and property-classification form paths are unchanged.
- Layout result: the month calendar and daily records now form one continuous reading surface; accounts use full-width grouped rows; no page-level horizontal scrolling is introduced.
- Interaction result: the first date tap shows records; the second opens the form. Existing records open with the original amount and classification. Save and void actions remain inside a fixed bottom action area.
- Security result: fixture QA made no production requests or writes. Investment writes remain absent; cashbook mutations use only the three allowlisted authenticated RPCs.
- Responsive result: the fixed five-item navigation reserves safe-area space and the two-column transaction rows remain readable down to 380px.
- Severity review: no P0, P1, or P2 visual or interaction findings remain.
- Final result: passed.
