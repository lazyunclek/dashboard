import assert from "node:assert/strict";
import { scheduledCashProjection } from "../credit-card-reserves.mjs";

const bank = { id: "bank", name: "玉山銀行", status: "active", account_type: "bank", currency: "TWD", balance: 120000 };
const card = { id: "card", name: "玉山 Pi 卡", status: "active", account_type: "credit_card", currency: "TWD", balance: -18000, credit_card_payment_source_account_id: "bank" };

const dynamic = scheduledCashProjection([bank, card], [{ id: "mortgage", status: "active", event_type: "expense", amount: 25000, source_account_id: "bank" }], "bank");
assert.equal(dynamic.net, -43000, "linked card outstanding and ordinary schedule must both reserve bank cash");
assert.equal(dynamic.scheduleCount, 1);
assert.deepEqual(dynamic.cardReserves.map((reserve) => reserve.amount), [18000]);

const fixedPayment = scheduledCashProjection([bank, card], [{ id: "card-payment", status: "active", event_type: "credit_card_payment", amount: 15000, source_account_id: "bank", destination_account_id: "card" }], "bank");
assert.equal(fixedPayment.net, -15000, "an exact card-payment schedule must replace, not double-count with, the live reserve");
assert.equal(fixedPayment.cardReserves.length, 0);

const unlinked = scheduledCashProjection([{ ...card, credit_card_payment_source_account_id: null }, bank], [], "bank");
assert.equal(unlinked.net, 0, "an unlinked card must not reserve a bank balance");

console.log("Credit-card cash reserve contract passed.");
