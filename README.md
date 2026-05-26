# lazyunclek/dashboard

Public static dashboard for market watchlists and other GitHub Pages-friendly outputs.

## Current structure

- `index.html`: public landing page
- `data/stocks.js`: watchlist snapshot used by the page

## Update flow

For now, the page is static and reads from `data/stocks.js`.

When Codex updates the dashboard, it should:

1. Refresh the watchlist snapshot in `data/stocks.js`
2. Keep `snapshotDate`, `updatedDate`, and `footerNote` in sync
3. Avoid adding any private account data, raw trade logs, API keys, or sensitive account-scale information

## Publishing

This repo is intended for GitHub Pages / static hosting.
