// Attribute historical stablecoin funding cost to still-held U.S. shares.
// This is a classification only: it never creates another cash flow or asset.
export function stablecoinEquityAllocation(transactions, assets, settlements, fundingRates) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const settlementByTrade = new Map(settlements.map((row) => [row.transaction_id, row]));
  const lots = new Map();
  let attributedTwd = 0;
  let pendingCount = 0;
  const trades = transactions.filter((row) => row.status !== "voided" && ["buy", "sell"].includes(row.transaction_type))
    .filter((row) => assetById.get(row.asset_id)?.asset_class === "us_equity")
    .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  for (const trade of trades) {
    const key = `${trade.account_id}:${trade.asset_id}`;
    const accountLots = lots.get(key) || [];
    const qty = Number(trade.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (trade.transaction_type === "buy") {
      const settlement = settlementByTrade.get(trade.id);
      const rate = settlement ? Number(fundingRates[settlement.currency]) : null;
      const amount = settlement ? Number(settlement.amount) : 0;
      if (settlement && (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount) || amount <= 0)) pendingCount++;
      const costTwd = settlement && rate > 0 && amount > 0 ? amount * rate : 0;
      accountLots.push({ quantity: qty, costTwd });
      attributedTwd += costTwd;
    } else {
      let remaining = qty;
      while (remaining > 1e-10 && accountLots.length) {
        const lot = accountLots[0];
        const used = Math.min(remaining, lot.quantity);
        const released = lot.costTwd * used / lot.quantity;
        lot.quantity -= used;
        lot.costTwd -= released;
        attributedTwd -= released;
        remaining -= used;
        if (lot.quantity < 1e-10) accountLots.shift();
      }
      if (remaining > 1e-10) pendingCount++;
    }
    lots.set(key, accountLots);
  }
  return { usEquityAttributedTwd: Math.max(0, attributedTwd), pendingCount };
}
