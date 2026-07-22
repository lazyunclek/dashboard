import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = String(process.argv[2] || "local").slice(0, 12).replace(/[^a-zA-Z0-9._-]/g, "");
if (!version) throw new Error("Missing asset version");

const indexPath = path.join(root, "index.html");
let html = await fs.readFile(indexPath, "utf8");
for (const asset of ["styles.css", "config.js", "app.js"]) {
  html = html.replace(new RegExp(`${asset.replace(".", "\\.")}(?:\\?v=[^\"']+)?`, "g"), `${asset}?v=${version}`);
}
await fs.writeFile(indexPath, html);
console.log(`Stamped static assets with ${version}`);
