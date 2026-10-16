const markets = ["tw_equity", "us_equity", "crypto"];

export function dayMove(position) {
  const expectedKind = position.assetClass === "crypto" ? "rolling_24h" : "previous_session_close";
  const current = Number(position.marketPrice);
  const baseline = Number(position.dayBaselinePrice);
  if (position.marketPriceStatus !== "fresh" || position.dayBaselineKind !== expectedKind
      || !Number.isFinite(current) || current <= 0 || !Number.isFinite(baseline) || baseline <= 0) return null;
  const percent = (current / baseline - 1) * 100;
  const quantity = Number(position.quantity);
  const fx = position.marketPriceCurrency === "TWD" ? 1 : Number(position.currentFx);
  const amountTwd = Number.isFinite(quantity) && quantity > 0 && Number.isFinite(fx) && fx > 0
    ? quantity * (current - baseline) * fx : null;
  return { percent, amountTwd, baseline, kind: expectedKind };
}

export function heatmapData(positions, filter = "all") {
  const open = positions.filter((row) => markets.includes(row.assetClass));
  const marketTotals = Object.fromEntries(markets.map((market) => [market, 0]));
  for (const row of open) {
    const value = Number(row.marketValueTwd);
    if (row.marketValueTwd !== null && Number.isFinite(value) && value > 0) marketTotals[row.assetClass] += value;
  }
  const marketTotal = Object.values(marketTotals).reduce((sum, value) => sum + value, 0);
  const selected = open.filter((row) => filter === "all" || row.assetClass === filter);
  const tiles = selected.filter((row) => row.marketValueTwd !== null && Number.isFinite(Number(row.marketValueTwd)) && Number(row.marketValueTwd) > 0)
    .sort((a, b) => Number(b.marketValueTwd) - Number(a.marketValueTwd));
  const total = tiles.reduce((sum, row) => sum + Number(row.marketValueTwd), 0);
  const sectors = new Map();
  for (const row of tiles) {
    const label = row.primarySector || "其他／待分類";
    sectors.set(label, (sectors.get(label) || 0) + Number(row.marketValueTwd));
  }
  return {
    tiles,
    total,
    missingCount: selected.length - tiles.length,
    marketTotals,
    marketTotal,
    sectors: [...sectors].map(([label, valueTwd]) => ({ label, valueTwd, percent: valueTwd / total * 100 }))
      .sort((a, b) => b.valueTwd - a.valueTwd)
  };
}

export function overviewTreemapData(data, scope = "all", marketFilter = "all") {
  const relevant = (data.positions || []).filter((row) => markets.includes(row.assetClass));
  const positions = relevant.filter((row) => row.marketValueTwd !== null
    && Number.isFinite(Number(row.marketValueTwd)) && Number(row.marketValueTwd) > 0);
  const marketTotals = Object.fromEntries(markets.map((market) => [market, 0]));
  for (const row of positions) marketTotals[row.assetClass] += Number(row.marketValueTwd);
  const marketTotal = Object.values(marketTotals).reduce((sum, value) => sum + value, 0);
  const selected = scope === "holdings" && markets.includes(marketFilter)
    ? positions.filter((row) => row.assetClass === marketFilter) : positions;
  const tiles = selected.map((row) => ({
    id: `position:${row.id}`,
    symbol: row.displaySymbol || row.symbol,
    name: row.name || "",
    category: ({ tw_equity: "台股", us_equity: "美股", crypto: "加密現貨" })[row.assetClass] || "其他持倉",
    kind: row.assetClass,
    marketValueTwd: Number(row.marketValueTwd)
  }));
  if (scope === "all") {
    const groups = new Map((data.groups || []).map((row) => [row.key, row]));
    const cryptoSpot = positions.filter((row) => row.assetClass === "crypto")
      .reduce((sum, row) => sum + Number(row.marketValueTwd), 0);
    for (const [id, symbol, name, kind, value] of [
      ["overview:cash", "現金", "目前現金淨額", "cash", Number(groups.get("cash")?.valueTwd)],
      ["overview:grid", "網格", "運行中網格淨值", "grid", Number(groups.get("crypto")?.valueTwd) - cryptoSpot],
      ["overview:property", "房地產", "預估可回收淨值", "property", Number(groups.get("property")?.valueTwd)]
    ]) {
      if (Number.isFinite(value) && value > 0) tiles.push({ id, symbol, name, category: name, kind, marketValueTwd: value });
    }
  }
  tiles.sort((a, b) => b.marketValueTwd - a.marketValueTwd);
  const total = tiles.reduce((sum, row) => sum + row.marketValueTwd, 0);
  const missingCount = relevant.filter((row) => (scope !== "holdings" || marketFilter === "all" || row.assetClass === marketFilter)
    && (row.marketValueTwd === null || !Number.isFinite(Number(row.marketValueTwd)))).length;
  const totalAssets = Number(data.totalAssetsTwd);
  return { tiles, total, missingCount, marketTotals, marketTotal,
    differenceTwd: scope === "all" && Number.isFinite(totalAssets) ? total - totalAssets : null };
}

export function treemapRects(tiles) {
  const result = new Map();
  function visit(rows, x, y, width, height) {
    if (!rows.length) return;
    if (rows.length === 1) {
      result.set(rows[0].id, { x, y, width, height });
      return;
    }
    const total = rows.reduce((sum, row) => sum + Number(row.marketValueTwd), 0);
    let split = 1;
    let firstValue = Number(rows[0].marketValueTwd);
    while (split < rows.length - 1 && firstValue < total / 2) {
      firstValue += Number(rows[split].marketValueTwd);
      split++;
    }
    const ratio = firstValue / total;
    if (width >= height) {
      visit(rows.slice(0, split), x, y, width * ratio, height);
      visit(rows.slice(split), x + width * ratio, y, width * (1 - ratio), height);
    } else {
      visit(rows.slice(0, split), x, y, width, height * ratio);
      visit(rows.slice(split), x, y + height * ratio, width, height * (1 - ratio));
    }
  }
  visit(tiles, 0, 0, 1, 1);
  return result;
}
export function overviewTileLabelMode(width, height) {
  if (width < 54 || height < 42) return "micro";
  if (width < 104 || height < 66) return "small";
  return "full";
}
