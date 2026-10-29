import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// Wrangler's migration journal makes this safe to run more than once.
if (!readdirSync("drizzle").some(name => name.endsWith(".sql"))) throw new Error("Generate a schema migration first.");
const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state"], { stdio: "inherit", input: "y\n" });
process.exitCode = result.status ?? 1;
