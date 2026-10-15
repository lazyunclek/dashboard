import assert from "node:assert/strict";
import { classifyGridRecords, GRID_MAX_AGE_MS } from "../grid-valuation.mjs";

const now = Date.parse("2026-10-15T09:00:00Z");
const records = [
  { id: "fresh", record_state: "running", source_updated_at: new Date(now - 15 * 60 * 1000).toISOString() },
  { id: "old", record_state: "running", source_updated_at: "2026-08-25T03:15:02Z" },
  { id: "missing", record_state: "running", source_updated_at: null },
  { id: "closed", record_state: "closed", source_updated_at: "2026-08-25T03:11:02Z" }
];
const classified = classifyGridRecords(records, now);
assert.deepEqual(classified.freshRunning.map((row) => row.id), ["fresh"]);
assert.deepEqual(classified.staleRunning.map((row) => row.id), ["old", "missing"]);
assert.deepEqual(classified.closed.map((row) => row.id), ["closed"]);
assert.equal(classifyGridRecords([{ ...records[0], source_updated_at: new Date(now - GRID_MAX_AGE_MS).toISOString() }], now).freshRunning.length, 1);
assert.equal(classifyGridRecords([{ ...records[0], source_updated_at: new Date(now - GRID_MAX_AGE_MS - 1).toISOString() }], now).staleRunning.length, 1);
console.log("Grid freshness valuation checks passed.");
