import assert from "node:assert/strict";
import { buildCapitalRecoveryHistory } from "../capital-recovery.mjs";

const row = (id, type, quantity, amount, date, extra = {}) => ({
  id, transaction_type: type, quantity, gross_amount: amount, fee_amount: 0, tax_amount: 0,
  net_cash_amount: type === "buy" ? -amount : amount, settlement_currency: "TWD",
  trade_date: date, created_at: `${date}T00:00:00Z`, ...extra
});

{
  const history = buildCapitalRecoveryHistory([
    row("1", "buy", 100, 1000, "2026-01-01"),
    row("2", "sell", 40, 400, "2026-01-02"),
    row("3", "sell", 60, 600, "2026-01-03")
  ]);
  assert.equal(history.cycles[0].status, "closed_after_recovery", "A full close is not zero-cost holding");
}

{
  const history = buildCapitalRecoveryHistory([
    row("1", "buy", 100, 1000, "2026-01-01"),
    row("2", "sell", 40, 400, "2026-01-02"),
    row("3", "sell", 30, 600, "2026-01-03"),
    row("4", "sell", 10, 200, "2026-01-04"),
    row("5", "buy", 20, 300, "2026-01-05"),
    row("6", "sell", 15, 300, "2026-01-06")
  ]);
  assert.equal(history.zeroCostCount, 2, "A later buy starts a new recovery round");
  assert.equal(history.cycles[0].triggerSellQuantity, 30);
  assert.equal(history.cycles[0].retainedAtZeroCost, 30);
  assert.equal(history.cycles[0].remainingQuantity, 20, "Later sales update the remaining zero-cost holding without changing the milestone");
  assert.equal(history.cycles[1].investedAmount, 300, "Earlier excess profit cannot offset a later buy");
  assert.equal(history.cycles[1].status, "zero_cost");
}

{
  const history = buildCapitalRecoveryHistory([
    row("1", "buy", 10, 100, "2026-01-01"),
    row("2", "sell", 5, 100, "2026-01-02"),
    row("3", "transfer_out", 2, 0, "2026-01-03"),
    row("4", "sell", 1, 20, "2026-01-04")
  ]);
  assert.equal(history.zeroCostCount, 1);
  assert.equal(history.cycles[0].remainingQuantity, 2, "Transfers change shares retained but not recovered cash");
  assert.equal(history.cycles[0].excessRecoveryAmount, 20, "Later zero-cost sales add to that completed round's realized gain");
}

{
  const history = buildCapitalRecoveryHistory([
    row("1", "buy", 4, 4443, "2026-07-06"),
    row("2", "buy", 10, 10759, "2026-07-06"),
    row("3", "buy", 5, 5354, "2026-07-06"),
    row("4", "sell", 19, 24890, "2026-07-13"),
    row("5", "buy", 3, 3181, "2026-09-04"),
    row("6", "buy", 3, 3121, "2026-09-14")
  ]);
  assert.equal(history.cycles.length, 2, "A completed round followed by a new buy creates a second round");
  assert.equal(history.realizedAmount, 4334, "First-round gain remains realized");
  assert.equal(history.currentRoundCost, 6302, "Second-round cost is not reduced by first-round profit");
}

{
  const history = buildCapitalRecoveryHistory([
    row("1", "buy", 10, 100, "2026-01-01", { settlement_currency: "TWD" }),
    row("2", "sell", 5, 100, "2026-01-02", { settlement_currency: "USD" })
  ]);
  assert.equal(history.status, "currency_mismatch", "Mixed settlement currencies are not aggregated");
}

console.log("Capital recovery cycle regression passed.");
