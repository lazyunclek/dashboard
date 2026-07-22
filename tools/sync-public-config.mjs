import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node tools/sync-public-config.mjs <client-config.json>");

const source = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
const forbiddenKeys = Object.keys(source).filter((key) => /service|secret|password|token/i.test(key));
if (forbiddenKeys.length) throw new Error(`Refusing config containing privileged fields: ${forbiddenKeys.join(", ")}`);

for (const key of ["supabase_url", "supabase_publishable_key", "project_ref"]) {
  if (!source[key] || typeof source[key] !== "string") throw new Error(`Missing safe public field: ${key}`);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(source.supabase_url)) throw new Error("Unexpected Supabase URL");
if (!/^sb_publishable_/i.test(source.supabase_publishable_key)) throw new Error("Expected a Supabase publishable key");

const output = `window.__INVESTMENT_DASHBOARD_CONFIG__ = Object.freeze(${JSON.stringify({
  supabaseUrl: source.supabase_url,
  supabasePublishableKey: source.supabase_publishable_key,
  projectRef: source.project_ref
}, null, 2)});\n`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await fs.writeFile(path.join(root, "config.js"), output, "utf8");
console.log("Public browser config synchronized (values not printed).");
