import assert from "node:assert/strict";
import { dayMove, heatmapData, treemapRects } from "../position-heatmap.mjs";

const rows = [
  { id: "tw", assetClass: "tw_equity", marketValueTwd: 300, primarySector: "半導體", marketPrice: 110, dayBaselinePrice: 100, dayBaselineKind: "previous_session_close", marketPriceStatus: "fresh", quantity: 10, marketPriceCurrency: "TWD", currentFx: 32 },
  { id: "us", assetClass: "us_equity", marketValueTwd: 200, primarySector: "半導體", marketPrice: 110, dayBaselinePrice: 100, dayBaselineKind: "previous_session_close", marketPriceStatus: "fresh", quantity: 10, marketPriceCurrency: "USD", currentFx: 32 },
  { id: "crypto", assetClass: "crypto", marketValueTwd: 500, primarySector: "加密資產", marketPrice: 90, dayBaselinePrice: 100, dayBaselineKind: "rolling_24h", marketPriceStatus: "fresh", quantity: 2, marketPriceCurrency: "USD", currentFx: 32 },
  { id: "missing", assetClass: "tw_equity", marketValueTwd: null, primarySector: "其他／待分類" }
];

const all = heatmapData(rows);
assert.equal(all.total, 1000);
assert.equal(all.missingCount, 1);
assert.deepEqual(all.marketTotals, { tw_equity: 300, us_equity: 200, crypto: 500 });
assert.equal(all.sectors.find((row) => row.label === "半導體").percent, 50);

const us = heatmapData(rows, "us_equity");
assert.equal(us.total, 200);
assert.equal(us.sectors[0].percent, 100);
assert.equal(us.marketTotal, 1000);

const rects = treemapRects(all.tiles);
let area = 0;
for (const row of all.tiles) {
  const rect = rects.get(row.id);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001);
  assert.ok(Math.abs(rect.width * rect.height - row.marketValueTwd / all.total) < 0.000001);
  area += rect.width * rect.height;
}
assert.ok(Math.abs(area - 1) < 0.000001);

assert.ok(Math.abs(dayMove(rows[0]).percent - 10) < 0.000001);
assert.equal(dayMove(rows[1]).amountTwd, 3200);
assert.ok(Math.abs(dayMove(rows[2]).percent + 10) < 0.000001);
assert.equal(dayMove({ ...rows[0], marketPriceStatus: "stale" }), null);
assert.equal(dayMove({ ...rows[0], dayBaselinePrice: null }), null);
assert.equal(dayMove({ ...rows[2], dayBaselineKind: "previous_session_close" }), null);

console.log("Position heatmap calculations passed.");
