import assert from "node:assert/strict";
import test from "node:test";
import { stablecoinEquityAllocation } from "./funding-allocation.mjs";

const assets = [{ id: "stock", asset_class: "us_equity" }];
const base = { asset_id: "stock", account_id: "new-platform", status: "reviewed", trade_date: "2026-10-23" };
test("USD and stablecoin trades coexist; sale releases historical allocation without new funding", () => {
  const trades = [
    { ...base, id: "usd", transaction_type: "buy", quantity: 2, created_at: "1" },
    { ...base, id: "coin", transaction_type: "buy", quantity: 3, created_at: "2" },
    { ...base, id: "sell", transaction_type: "sell", quantity: 4, created_at: "3" }
  ];
  const result = stablecoinEquityAllocation(trades, assets,
    [{ transaction_id: "coin", currency: "USDC", amount: 300 }], { USDC: 30 });
  assert.equal(result.usEquityAttributedTwd, 3000);
  assert.equal(result.pendingCount, 0);
});
test("missing historical USDT cost remains pending", () => {
  const result = stablecoinEquityAllocation([{ ...base, id: "coin", transaction_type: "buy", quantity: 1 }], assets,
    [{ transaction_id: "coin", currency: "USDT", amount: 100 }], {});
  assert.deepEqual(result, { usEquityAttributedTwd: 0, pendingCount: 1 });
});
test("lots are isolated by platform and fee is already in the exact stablecoin debit", () => {
  const trades = [
    { ...base, id: "new-buy", transaction_type: "buy", quantity: 2, account_id: "new-platform" },
    { ...base, id: "old-sell", transaction_type: "sell", quantity: 1, account_id: "yuanta" }
  ];
  const result = stablecoinEquityAllocation(trades, assets,
    [{ transaction_id: "new-buy", currency: "USDT", amount: 201, fee_included_amount: 1 }], { USDT: 31 });
  assert.equal(result.usEquityAttributedTwd, 6231);
  assert.equal(result.pendingCount, 1);
});
