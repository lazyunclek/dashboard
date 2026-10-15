export const GRID_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function classifyGridRecords(records, nowMs = Date.now()) {
  const freshRunning = [];
  const staleRunning = [];
  const closed = [];
  for (const row of records) {
    if (row.record_state === "closed") {
      closed.push(row);
      continue;
    }
    if (row.record_state !== "running") continue;
    const updatedMs = Date.parse(row.source_updated_at || "");
    if (Number.isFinite(updatedMs) && updatedMs <= nowMs + 5 * 60 * 1000 && nowMs - updatedMs <= GRID_MAX_AGE_MS) freshRunning.push(row);
    else staleRunning.push(row);
  }
  return { freshRunning, staleRunning, closed };
}
