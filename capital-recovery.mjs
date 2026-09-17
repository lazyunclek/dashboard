const numeric = (value) => Number(value ?? 0) || 0;

function paidAmount(row) {
  if (row.net_cash_amount !== null && row.net_cash_amount !== undefined) return Math.abs(numeric(row.net_cash_amount));
  return Math.abs(numeric(row.gross_amount)) + numeric(row.fee_amount) + numeric(row.tax_amount);
}

function receivedAmount(row) {
  if (row.net_cash_amount !== null && row.net_cash_amount !== undefined) return Math.abs(numeric(row.net_cash_amount));
  return Math.abs(numeric(row.gross_amount)) - numeric(row.fee_amount) - numeric(row.tax_amount);
}

function compareRows(left, right) {
  return String(left.trade_date || "").localeCompare(String(right.trade_date || ""))
    || String(left.created_at || "").localeCompare(String(right.created_at || ""))
    || String(left.id || "").localeCompare(String(right.id || ""));
}

/**
 * Derives separate capital-recovery rounds from the immutable transaction
 * ledger. A sale can complete a round only while shares remain; a full close
 * is kept as a closed-position outcome, never mislabeled as zero-cost.
 */
export function buildCapitalRecoveryHistory(rows, { quantityScale = 8, tolerance = 1e-10 } = {}) {
  const ordered = [...rows].filter((row) => row?.status !== "voided").sort(compareRows);
  const currencies = [...new Set(ordered
    .filter((row) => ["buy", "sell"].includes(row.transaction_type))
    .map((row) => row.settlement_currency)
    .filter(Boolean))];
  const quantityTolerance = Math.max(tolerance, 10 ** -Math.min(10, Math.max(0, numeric(quantityScale))));
  if (currencies.length > 1) {
    return { status: "currency_mismatch", settlementCurrency: null, cycles: [], activeCycle: null, zeroCostCount: 0 };
  }

  let quantity = 0;
  let current = null;
  let latestZeroCostCycle = null;
  const cycles = [];
  const startCycle = (row) => ({
    number: cycles.length + 1,
    status: "recovering",
    startedOn: row.trade_date || null,
    completedOn: null,
    investedAmount: 0,
    recoveredAmount: 0,
    outstandingAmount: 0,
    buyQuantity: 0,
    soldQuantity: 0,
    triggerSellQuantity: null,
    triggerSellAmount: null,
    retainedAtZeroCost: null,
    remainingQuantity: null,
    excessRecoveryAmount: 0,
    closureReason: null
  });
  const closeCycle = (status, row, { trigger = false, reason = null } = {}) => {
    current.status = status;
    current.completedOn = row.trade_date || null;
    current.remainingQuantity = Math.abs(quantity) <= quantityTolerance ? 0 : quantity;
    current.outstandingAmount = Math.max(0, current.investedAmount - current.recoveredAmount);
    current.excessRecoveryAmount = Math.max(0, current.recoveredAmount - current.investedAmount);
    current.closureReason = reason;
    if (trigger) {
      current.triggerSellQuantity = numeric(row.quantity);
      current.triggerSellAmount = receivedAmount(row);
      current.retainedAtZeroCost = current.remainingQuantity;
    }
    cycles.push(current);
    if (status === "zero_cost") latestZeroCostCycle = current;
    current = null;
  };

  for (const row of ordered) {
    const rowQuantity = numeric(row.quantity);
    if (row.transaction_type === "buy") {
      if (!current) {
        current = startCycle(row);
        latestZeroCostCycle = null;
      }
      const paid = paidAmount(row);
      quantity += rowQuantity;
      current.investedAmount += paid;
      current.buyQuantity += rowQuantity;
      current.outstandingAmount = Math.max(0, current.investedAmount - current.recoveredAmount);
      continue;
    }
    if (row.transaction_type === "sell") {
      quantity -= rowQuantity;
      if (!current) {
        if (latestZeroCostCycle) latestZeroCostCycle.remainingQuantity = Math.max(0, quantity);
        continue;
      }
      current.soldQuantity += rowQuantity;
      current.recoveredAmount += receivedAmount(row);
      current.outstandingAmount = Math.max(0, current.investedAmount - current.recoveredAmount);
      if (current.recoveredAmount + tolerance >= current.investedAmount && quantity > quantityTolerance) {
        closeCycle("zero_cost", row, { trigger: true });
      } else if (quantity <= quantityTolerance) {
        closeCycle(current.recoveredAmount + tolerance >= current.investedAmount ? "closed_after_recovery" : "closed_unrecovered", row, { reason: "position_closed" });
      }
      continue;
    }
    if (["transfer_in", "adjustment"].includes(row.transaction_type)) quantity += rowQuantity;
    if (row.transaction_type === "transfer_out" || row.details?.event_role === "asset_fee") {
      quantity -= rowQuantity;
      if (!current && latestZeroCostCycle) latestZeroCostCycle.remainingQuantity = Math.max(0, quantity);
    }
    if (current && quantity <= quantityTolerance) closeCycle("closed_unrecovered", row, { reason: "position_closed_without_sale" });
  }

  if (current) {
    current.remainingQuantity = Math.abs(quantity) <= quantityTolerance ? 0 : quantity;
    current.outstandingAmount = Math.max(0, current.investedAmount - current.recoveredAmount);
    cycles.push(current);
  }
  const activeCycle = cycles.findLast((cycle) => cycle.status === "recovering") || null;
  return {
    status: ordered.length ? "ready" : "empty",
    settlementCurrency: currencies[0] || null,
    cycles,
    activeCycle,
    zeroCostCount: cycles.filter((cycle) => cycle.status === "zero_cost").length
  };
}
