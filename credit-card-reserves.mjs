const numeric = (value) => Number(value) || 0;

const scheduledDebitTypes = new Set(["expense", "transfer", "credit_card_payment", "investment_funding_transfer"]);
const scheduledCreditTypes = new Set(["transfer", "credit_card_payment", "investment_funding_transfer"]);

/**
 * Keeps formal balances separate from a planning-only cash availability view.
 * An active card linked to this payment account reserves its live outstanding
 * balance, unless an explicit active card-payment schedule already provides a
 * fixed amount for the same bank/card pair.
 */
export function scheduledCashProjection(accounts, schedules, accountId) {
  let net = 0;
  let scheduleCount = 0;
  const scheduleRows = [];
  const activeSchedules = schedules.filter((schedule) => schedule.status === "active");

  for (const schedule of activeSchedules) {
    let delta = 0;
    if (schedule.source_account_id === accountId && scheduledDebitTypes.has(schedule.event_type)) delta -= numeric(schedule.amount);
    if (schedule.destination_account_id === accountId && scheduledCreditTypes.has(schedule.event_type)) delta += numeric(schedule.amount);
    if (delta) {
      net += delta;
      scheduleCount += 1;
      scheduleRows.push({ ...schedule, delta });
    }
  }

  const cardReserves = [];
  for (const card of accounts.filter((account) => account.status === "active" && account.account_type === "credit_card" && account.credit_card_payment_source_account_id === accountId)) {
    const hasFixedPaymentSchedule = activeSchedules.some((schedule) => schedule.event_type === "credit_card_payment" && schedule.source_account_id === accountId && schedule.destination_account_id === card.id);
    const outstanding = Math.max(0, -numeric(card.balance));
    if (hasFixedPaymentSchedule || outstanding <= 0) continue;
    net -= outstanding;
    cardReserves.push({ accountId: card.id, name: card.name, currency: card.currency, amount: outstanding });
  }

  return { net, count: scheduleCount + cardReserves.length, scheduleCount, scheduleRows, cardReserves };
}
