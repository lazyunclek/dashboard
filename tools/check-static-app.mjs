import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = ["index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icon.svg", ".github/workflows/pages.yml", "tools/stamp-assets.mjs"];
for (const file of required) await fs.access(path.join(root, file));

const [html, css, app, config, workflow] = await Promise.all([
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "styles.css"), "utf8"),
  fs.readFile(path.join(root, "app.js"), "utf8"),
  fs.readFile(path.join(root, "config.js"), "utf8"),
  fs.readFile(path.join(root, ".github/workflows/pages.yml"), "utf8")
]);

for (const token of ["login-view", "dashboard-view", "positions-list", "transaction-search", "transaction-filters", "transaction-list", "current-cash", "running-grid-count", "cashbook-panel", "cashbook-calendar-grid", "cashbook-entry-list", "cashbook-form"]) {
  if (!html.includes(`id="${token}"`)) throw new Error(`Missing HTML target: ${token}`);
}
if (html.includes('id="top-positions"') || html.includes("主要持倉")) throw new Error("Overview must not duplicate the positions list");
for (const token of ["data-asset-ledger", "data-transaction-type", "transactionAssetId", "row.asset_id !== state.transactionAssetId", "transactionQuery", "transactionType", "renderActivity();\n  showTab(\"activity\")"]) {
  if (!app.includes(token)) throw new Error(`Missing ledger filter behavior: ${token}`);
}
for (const token of ["position-return", "pnlPercent", "unrealizedPnlPct.toFixed(2)"]) {
  if (!app.includes(token)) throw new Error(`Missing visible position return percentage: ${token}`);
}
for (const token of ["持倉均價", "累計買入均價", "累計賣出均價", "function weightedTradePrice", "buyAveragePrice", "sellAveragePrice"]) {
  if (!app.includes(token)) throw new Error(`Missing position average-price detail: ${token}`);
}
for (const token of ["function transactionCashflow", "function transactionCashflowLabel", "function transactionCharges", "每股", "買入金額", "賣出金額", "費用合計", "實付", "實收", "transaction-gross", "transaction-charge-total", "transaction-cashflow"]) {
  if (!app.includes(token)) throw new Error(`Missing per-transaction cashflow detail: ${token}`);
}
for (const token of ["未實現損益", "已實現合計", "const realizedTotal"]) {
  if (!app.includes(token)) throw new Error(`Missing position profit detail: ${token}`);
}
for (const token of ["function quoteFreshness", "marketPriceStatus", "行情過期", "marketUpdates", "stalePriceCount"]) {
  if (!app.includes(token)) throw new Error(`Missing market-price freshness behavior: ${token}`);
}
if (!html.includes("重新讀取已同步行情")) throw new Error("Mobile refresh control must disclose that it rereads synchronized prices");
for (const token of ["cashValueTwd", "runningGridCount", "runningGridPnlUsd"]) {
  if (!app.includes(token)) throw new Error(`Missing overview capital or strategy signal: ${token}`);
}
for (const token of ["canonicalPositions", "component.latest_price", "component.net_value_twd ?? component.gross_value_twd"]) {
  if (!app.includes(token)) throw new Error(`Missing position snapshot fallback: ${token}`);
}
for (const token of ["function perSharePrice", 'assetClass === "tw_equity"', "amount >= 10 && amount < 100", "perSharePrice(row.unit_price", "perSharePrice(position.averageCost"]) {
  if (!app.includes(token)) throw new Error(`Missing two-digit Taiwan equity per-share price formatting: ${token}`);
}
if (!app.includes("function spotPositionKey") || !app.includes("replace(/-(?:USD|USDT|USDC)$/")) throw new Error("Crypto spot alias deduplication missing");
if (!app.includes("fetchLatestMarketPrices") || !app.includes("asset_id=eq.${encodeURIComponent(asset.id)}")) throw new Error("Latest per-asset market price query missing");
if (app.includes("order=fetched_at.desc&limit=1000")) throw new Error("Global market-price truncation query must not be used");
for (const query of ["investment_portfolios", "investment_assets", "investment_transactions", "investment_income_events", "investment_market_prices", "investment_portfolio_component_values", "investment_grid_records"]) {
  if (!app.includes(query)) throw new Error(`Missing read source: ${query}`);
}
if (/service[_-]?role|SUPABASE_SERVICE_ROLE|secret[_-]?key/i.test(`${app}\n${config}`)) throw new Error("Privileged Supabase credential reference found");
if (/method:\s*["'](?:PATCH|PUT|DELETE)["']/i.test(app)) throw new Error("Investment mutation method found");
const postCalls = [...app.matchAll(/method:\s*["']POST["']/gi)].length;
if (postCalls !== 2 || !app.includes("/auth/v1/token") || !app.includes("/rest/v1/rpc/${name}")) throw new Error("Only Auth and the controlled cashbook RPC wrapper may use POST");
for (const rpc of ["cashbook_ensure_defaults", "cashbook_event_save", "cashbook_event_delete"]) {
  if (!app.includes(`"${rpc}"`)) throw new Error(`Missing allowed cashbook RPC: ${rpc}`);
}
if (!app.includes("cashbookRpcNames.has(name)")) throw new Error("Cashbook RPC allowlist enforcement missing");
for (const source of ["cashbook_accounts", "cashbook_account_balances", "cashbook_categories", "cashbook_ledger", "cashbook_events"]) {
  if (!app.includes(source)) throw new Error(`Missing cashbook read source: ${source}`);
}
for (const behavior of ["armedDate", "openCashbookForm", "saveCashbookEvent", "loadCashbook", "investment_mobile", "property_cost_recovery"]) {
  if (!app.includes(behavior)) throw new Error(`Missing mobile cashbook behavior: ${behavior}`);
}
if (!html.includes('<option value="investment_recovery_transfer">資產回收</option>')) throw new Error("Asset recovery event option missing");
for (const behavior of ["investment_recovery_transfer", "asset_recovery_basis", "net_sale_proceeds", "實際淨收款"]) {
  if (!app.includes(behavior)) throw new Error(`Missing asset recovery behavior: ${behavior}`);
}
if (!css.includes("is-investment_recovery_transfer")) throw new Error("Asset recovery calendar marker missing");
if (!config.includes("sb_publishable_") || config.includes("__SUPABASE_")) throw new Error("Public Supabase config has not been synchronized");
if (!css.includes("@media (max-width: 380px)") || !css.includes("@media (min-width: 680px)")) throw new Error("Responsive breakpoints missing");
if (!workflow.includes("actions/deploy-pages")) throw new Error("GitHub Pages deployment step missing");
if (!workflow.includes("tools/stamp-assets.mjs")) throw new Error("GitHub Pages asset cache busting step missing");

console.log("Static app contract passed.");
console.log("Verified: required files, investment reads, allowlisted cashbook RPC writes, no privileged key, responsive CSS, Pages workflow.");
