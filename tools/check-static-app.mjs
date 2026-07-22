import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = ["index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icon.svg", ".github/workflows/pages.yml"];
for (const file of required) await fs.access(path.join(root, file));

const [html, css, app, config, workflow] = await Promise.all([
  fs.readFile(path.join(root, "index.html"), "utf8"),
  fs.readFile(path.join(root, "styles.css"), "utf8"),
  fs.readFile(path.join(root, "app.js"), "utf8"),
  fs.readFile(path.join(root, "config.js"), "utf8"),
  fs.readFile(path.join(root, ".github/workflows/pages.yml"), "utf8")
]);

for (const token of ["login-view", "dashboard-view", "positions-list", "transaction-list"]) {
  if (!html.includes(`id="${token}"`)) throw new Error(`Missing HTML target: ${token}`);
}
for (const query of ["investment_portfolios", "investment_assets", "investment_transactions", "investment_income_events", "investment_market_prices", "investment_portfolio_component_values", "investment_grid_records"]) {
  if (!app.includes(query)) throw new Error(`Missing read source: ${query}`);
}
if (/service[_-]?role|SUPABASE_SERVICE_ROLE|secret[_-]?key/i.test(`${app}\n${config}`)) throw new Error("Privileged Supabase credential reference found");
if (/method:\s*["'](?:PATCH|PUT|DELETE)["']/i.test(app)) throw new Error("Investment mutation method found");
const postCalls = [...app.matchAll(/method:\s*["']POST["']/gi)].length;
if (postCalls !== 1 || !app.includes("/auth/v1/token")) throw new Error("Only the Supabase Auth token exchange may use POST");
if (!config.includes("sb_publishable_") || config.includes("__SUPABASE_")) throw new Error("Public Supabase config has not been synchronized");
if (!css.includes("@media (max-width: 380px)") || !css.includes("@media (min-width: 680px)")) throw new Error("Responsive breakpoints missing");
if (!workflow.includes("actions/deploy-pages")) throw new Error("GitHub Pages deployment step missing");

console.log("Static app contract passed.");
console.log("Verified: required files, read sources, auth-only POST, no privileged key, responsive CSS, Pages workflow.");
