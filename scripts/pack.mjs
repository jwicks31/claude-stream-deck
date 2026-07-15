/* Pack the built .sdPlugin folder into dist/claude-deck.streamDeckPlugin (a zip). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleName = "com.articulate.claude-usage.sdPlugin";
const bundle = path.join(root, bundleName);
if (!existsSync(path.join(bundle, "bin", "plugin.mjs"))) {
  console.error("Run `npm run build` first.");
  process.exit(1);
}

const dist = path.join(root, "dist");
mkdirSync(dist, { recursive: true });
const out = path.join(dist, "claude-deck.streamDeckPlugin");
rmSync(out, { force: true });

execFileSync("zip", ["-r", "-q", out, bundleName, "-x", "*.DS_Store"], { cwd: root, stdio: "inherit" });
console.log("packed →", path.relative(root, out));
