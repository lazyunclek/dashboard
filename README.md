# lazyunclek/dashboard

Public static dashboard for market watchlists and other GitHub Pages-friendly outputs.

## Current structure

- `index.html`: public landing page
- `data/stocks.js`: watchlist snapshot used by the page
- `data/stock-details.js`: public stock-detail bundle rendered by the detail panel
- `scripts/build_stock_detail_data.py`: rebuilds `data/stock-details.js` from local `../stock/**/*.md`

## Update flow

The page is still static, but now it reads two public data layers:

1. `data/stocks.js` for the watchlist snapshot, priority, entry/add zones, and summary cards
2. `data/stock-details.js` for each selected stock's fundamental notes, tracking points, risks, and source links

`data/stock-details.js` is generated from the local research notes under `stock/`, but the deployed site reads only the bundled public files inside the `dashboard/` repo.

When a user clicks a stock row, the dashboard loads that stock note and renders:

- latest fundamental bullets
- tracking points
- risks
- source links / recent important documents

When Codex updates the dashboard, it should:

1. Refresh the watchlist snapshot in `data/stocks.js`
2. Keep each stock's `notePath` aligned with the real Markdown file under `stock/`
3. Rebuild `data/stock-details.js` after stock-note updates by running `python3 scripts/build_stock_detail_data.py` from `dashboard/`
4. Keep `snapshotDate`, `updatedDate`, and `footerNote` in sync
5. Avoid adding any private account data, raw trade logs, API keys, or sensitive account-scale information

## Publishing

This repo is intended for GitHub Pages / static hosting.

For local preview, prefer serving the folder over HTTP before deployment, for example `python3 -m http.server 8008` from the workspace root and then opening `/dashboard/`.
